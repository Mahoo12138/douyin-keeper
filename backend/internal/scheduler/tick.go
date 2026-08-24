package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

type authorizationGate interface {
	Authorize(context.Context, entitlement.AuthorizationRequest) (entitlement.AuthorizationDecision, error)
}

type dailyQuota interface {
	ReserveDaily(context.Context, int64, string) error
}

type txManager interface {
	WithinTx(context.Context, func(context.Context) error) error
}

type intentStore interface {
	CreateScheduledIntent(context.Context, *send.SendIntent) (bool, error)
	CreateJob(context.Context, *send.SendJob) error
	SetIntentLastJob(context.Context, int64, int64) error
	SetIntentStatus(context.Context, int64, send.IntentStatus, *string, *time.Time, time.Time) error
}

// TickRunner creates at most one scheduled intent per task and site-local day.
// It never talks to Redis, Asynq, or a platform adapter; all queue delivery is
// left to the transactional outbox publisher (docs/15 §3).
type TickRunner struct {
	tasks  task.DueRepository
	sends  intentStore
	gate   authorizationGate
	quota  dailyQuota
	outbox outbox.Outbox
	tx     txManager
	limit  int
	now    func() time.Time
}

type TickStats struct {
	Scanned int
	Created int
	Skipped int
}

func NewTickRunner(tasks task.DueRepository, sends intentStore, gate authorizationGate,
	quota dailyQuota, relay outbox.Outbox, tx txManager, limit int) *TickRunner {
	if limit <= 0 {
		limit = 100
	}
	return &TickRunner{tasks: tasks, sends: sends, gate: gate, quota: quota,
		outbox: relay, tx: tx, limit: limit, now: time.Now}
}

// SetNow makes tick boundaries deterministic in tests and keeps the runtime
// clock injectable without exposing scheduler internals.
func (r *TickRunner) SetNow(now func() time.Time) { r.now = now }

// RunOnce performs one bounded scheduler scan. It is intentionally exposed as
// a single tick so the command loop and integration tests share identical
// behavior.
func (r *TickRunner) RunOnce(ctx context.Context) (TickStats, error) {
	if r.tasks == nil || r.sends == nil || r.gate == nil || r.quota == nil ||
		r.outbox == nil || r.tx == nil {
		return TickStats{}, apperr.New(apperr.CodeInternal, apperr.KindInternal, "scheduler tick is not configured")
	}
	now := time.Now()
	if r.now != nil {
		now = r.now()
	}
	due, err := r.tasks.ListDue(ctx, now, r.limit)
	if err != nil {
		return TickStats{}, err
	}
	stats := TickStats{Scanned: len(due)}
	var firstErr error
	for _, t := range due {
		created, skipped, err := r.createIntent(ctx, t, now)
		if err != nil && firstErr == nil {
			firstErr = err
		}
		if created {
			stats.Created++
		}
		if skipped {
			stats.Skipped++
		}
	}
	return stats, firstErr
}

func (r *TickRunner) createIntent(ctx context.Context, t *task.SparkTask, now time.Time) (created, skipped bool, err error) {
	if t == nil {
		return false, false, fmt.Errorf("scheduler: nil due task")
	}
	localDate := entitlement.EffectiveLocalDate(now)
	err = r.tx.WithinTx(ctx, func(tctx context.Context) error {
		in := &send.SendIntent{
			PublicID: uuid.New(), IntentType: send.IntentScheduled,
			TaskID: &t.ID, AccountID: t.AccountID, FriendID: t.FriendID,
			LocalDate: &localDate, ScheduledAt: now, Status: send.IntentPending,
			CreatedAt: now, UpdatedAt: now,
		}
		inserted, err := r.sends.CreateScheduledIntent(tctx, in)
		if err != nil || !inserted {
			return err
		}
		created = true

		decision, err := r.gate.Authorize(tctx, entitlement.AuthorizationRequest{
			UserID: t.UserID, Action: entitlement.ActionSendExecute,
		})
		if err != nil {
			return err
		}
		if !decision.Allowed {
			code := decision.ReasonCode
			if code == "" {
				code = apperr.CodeForbidden
			}
			skipped = true
			return r.markSkipped(tctx, in.ID, code, now)
		}

		if err := r.quota.ReserveDaily(tctx, t.UserID, localDate); err != nil {
			if code, ok := schedulerSkipCode(err); ok {
				skipped = true
				return r.markSkipped(tctx, in.ID, code, now)
			}
			return err
		}

		job := &send.SendJob{
			PublicID: uuid.New(), IntentID: in.ID, AccountID: t.AccountID,
			FriendID: t.FriendID, Attempt: 1, Status: send.JobQueued, CreatedAt: now,
		}
		if err := r.sends.CreateJob(tctx, job); err != nil {
			return err
		}
		if err := r.sends.SetIntentLastJob(tctx, in.ID, job.ID); err != nil {
			return err
		}
		if err := r.sends.SetIntentStatus(tctx, in.ID, send.IntentQueued, nil, nil, now); err != nil {
			return err
		}
		payload, err := json.Marshal(map[string]string{
			"intent_id": in.PublicID.String(), "job_id": job.PublicID.String(),
		})
		if err != nil {
			return err
		}
		return r.outbox.Add(tctx, outbox.Message{
			Kind: outbox.KindSendDispatch, AggregateType: "send_intent",
			AggregateID: in.PublicID.String(), Payload: payload,
			AvailableAt: now, DedupeKey: "send.dispatch:" + in.PublicID.String(),
		})
	})
	return created, skipped, err
}

func (r *TickRunner) markSkipped(ctx context.Context, intentID int64, code string, now time.Time) error {
	return r.sends.SetIntentStatus(ctx, intentID, send.IntentSkipped, &code, nil, now)
}

func schedulerSkipCode(err error) (string, bool) {
	app, ok := apperr.As(err)
	if !ok || (app.Kind != apperr.KindQuota && app.Kind != apperr.KindForbidden) {
		return "", false
	}
	return app.Code, true
}
