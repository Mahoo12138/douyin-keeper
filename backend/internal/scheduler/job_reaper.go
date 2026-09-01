package scheduler

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

type expiredJobStore interface {
	FindExpiredLeases(context.Context, time.Time, int) ([]*job.Job, error)
	FinishExpired(context.Context, int64, job.Status, *string, time.Time) (bool, error)
	AppendEvent(context.Context, int64, job.JobEvent) error
}

type bindingCleanupStore interface {
	GetByID(context.Context, int64) (*account.Account, error)
	SoftDelete(context.Context, int64) error
}

// JobLeaseReaper closes generic jobs whose worker lease expired. A cancelled
// job is finalized as cancelled; all other expired jobs fail closed with
// OUTCOME_UNKNOWN. Binding jobs also remove an account left in binding state.
// The reaper never retries a generic platform job after a worker crash.
type JobLeaseReaper struct {
	jobs     expiredJobStore
	accounts bindingCleanupStore
	tx       txManager
	limit    int
	now      func() time.Time
}

func NewJobLeaseReaper(jobs expiredJobStore, accounts bindingCleanupStore, tx txManager, limit int) *JobLeaseReaper {
	if limit <= 0 {
		limit = 100
	}
	return &JobLeaseReaper{jobs: jobs, accounts: accounts, tx: tx, limit: limit, now: time.Now}
}

func (r *JobLeaseReaper) SetNow(now func() time.Time) { r.now = now }

func (r *JobLeaseReaper) RunOnce(ctx context.Context) (int, error) {
	if r.jobs == nil || r.tx == nil {
		return 0, apperr.New(apperr.CodeInternal, apperr.KindInternal, "job lease reaper is not configured")
	}
	at := time.Now()
	if r.now != nil {
		at = r.now()
	}
	count := 0
	err := r.tx.WithinTx(ctx, func(tctx context.Context) error {
		items, err := r.jobs.FindExpiredLeases(tctx, at, r.limit)
		if err != nil {
			return err
		}
		for _, item := range items {
			if item == nil {
				continue
			}
			status := job.StatusFailed
			var code = apperr.CodeOutcomeUnknown
			eventType := "error"
			payload := json.RawMessage(`{"code":"OUTCOME_UNKNOWN","reason":"lease_expired"}`)
			if item.CancelRequestedAt != nil {
				status = job.StatusCancelled
				code = ""
				eventType = "cancelled"
				payload = json.RawMessage(`{"reason":"user_requested"}`)
			}
			var errorCode *string
			if code != "" {
				errorCode = &code
			}
			finished, err := r.jobs.FinishExpired(tctx, item.ID, status, errorCode, at)
			if err != nil {
				return err
			}
			if !finished {
				continue
			}
			if err := r.jobs.AppendEvent(tctx, item.ID, job.JobEvent{
				EventType: eventType, Payload: payload, CreatedAt: at,
			}); err != nil {
				return err
			}
			if err := r.cleanupBinding(tctx, item); err != nil {
				return err
			}
			count++
		}
		return nil
	})
	if err != nil {
		// Job closure, event append and binding cleanup share one transaction.
		return 0, err
	}
	return count, err
}

func (r *JobLeaseReaper) cleanupBinding(ctx context.Context, item *job.Job) error {
	if r.accounts == nil || item.AccountID == nil || !strings.HasPrefix(item.Type, "account.bind.") {
		return nil
	}
	acct, err := r.accounts.GetByID(ctx, *item.AccountID)
	if err != nil {
		if app, ok := apperr.As(err); ok && app.Code == apperr.CodeNotFound {
			return nil
		}
		return err
	}
	if acct.BindingStatus == account.BindingBinding {
		return r.accounts.SoftDelete(ctx, acct.ID)
	}
	return nil
}
