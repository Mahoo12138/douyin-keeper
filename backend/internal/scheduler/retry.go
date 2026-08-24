package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

type retryStore interface {
	FindRetryDue(context.Context, time.Time, int) ([]send.RetryDueIntent, error)
	CountJobsForIntent(context.Context, int64) (int, error)
	CreateJob(context.Context, *send.SendJob) error
	SetIntentLastJob(context.Context, int64, int64) error
	SetIntentStatus(context.Context, int64, send.IntentStatus, *string, *time.Time, time.Time) error
}

// RetryRunner turns due retry_wait intents into fresh SendJob attempts and a
// transactional send.dispatch outbox row. It retains the original daily
// reservation; only terminal failure releases it.
type RetryRunner struct {
	sends  retryStore
	quota  quotaAccounting
	outbox outbox.Outbox
	tx     txManager
	limit  int
	now    func() time.Time
}

type RetryStats struct {
	Scanned   int
	Requeued  int
	Exhausted int
}

func NewRetryRunner(sends retryStore, quota quotaAccounting, relay outbox.Outbox, tx txManager, limit int) *RetryRunner {
	if limit <= 0 {
		limit = 100
	}
	return &RetryRunner{sends: sends, quota: quota, outbox: relay, tx: tx, limit: limit, now: time.Now}
}

func (r *RetryRunner) SetNow(now func() time.Time) { r.now = now }

func (r *RetryRunner) RunOnce(ctx context.Context) (RetryStats, error) {
	if r.sends == nil || r.quota == nil || r.outbox == nil || r.tx == nil {
		return RetryStats{}, apperr.New(apperr.CodeInternal, apperr.KindInternal, "retry runner is not configured")
	}
	at := time.Now()
	if r.now != nil {
		at = r.now()
	}
	stats := RetryStats{}
	err := r.tx.WithinTx(ctx, func(tctx context.Context) error {
		due, err := r.sends.FindRetryDue(tctx, at, r.limit)
		if err != nil {
			return err
		}
		stats.Scanned = len(due)
		for _, item := range due {
			if item.Intent == nil {
				return fmt.Errorf("retry runner: malformed retry intent")
			}
			count, err := r.sends.CountJobsForIntent(tctx, item.Intent.ID)
			if err != nil {
				return err
			}
			if count >= send.MaxSendAttempts {
				code := item.Intent.ErrorCode
				if code == nil || *code == "" {
					value := apperr.CodeConflict
					code = &value
				}
				if err := r.sends.SetIntentStatus(tctx, item.Intent.ID, send.IntentFailed, code, nil, at); err != nil {
					return err
				}
				if err := releaseRetryQuota(tctx, r.quota, item); err != nil {
					return err
				}
				stats.Exhausted++
				continue
			}

			attempt := count + 1
			job := &send.SendJob{
				PublicID: uuid.New(), IntentID: item.Intent.ID, AccountID: item.Intent.AccountID,
				FriendID: item.Intent.FriendID, Attempt: attempt, Status: send.JobQueued, CreatedAt: at,
			}
			if err := r.sends.CreateJob(tctx, job); err != nil {
				return err
			}
			if err := r.sends.SetIntentLastJob(tctx, item.Intent.ID, job.ID); err != nil {
				return err
			}
			if err := r.sends.SetIntentStatus(tctx, item.Intent.ID, send.IntentQueued, nil, nil, at); err != nil {
				return err
			}
			payload, err := json.Marshal(map[string]string{
				"intent_id": item.Intent.PublicID.String(), "job_id": job.PublicID.String(),
			})
			if err != nil {
				return err
			}
			if err := r.outbox.Add(tctx, outbox.Message{
				Kind: outbox.KindSendDispatch, AggregateType: "send_intent",
				AggregateID: item.Intent.PublicID.String(), Payload: payload, AvailableAt: at,
				DedupeKey: fmt.Sprintf("send.dispatch:%s:attempt:%d", item.Intent.PublicID, attempt),
			}); err != nil {
				return err
			}
			stats.Requeued++
		}
		return nil
	})
	return stats, err
}

func releaseRetryQuota(ctx context.Context, quota quotaAccounting, item send.RetryDueIntent) error {
	if item.Intent.LocalDate == nil || *item.Intent.LocalDate == "" {
		return nil
	}
	if err := quota.ReleaseDaily(ctx, item.UserID, *item.Intent.LocalDate); err != nil {
		return err
	}
	return quota.IncrFailed(ctx, item.UserID, *item.Intent.LocalDate)
}
