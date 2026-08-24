package scheduler

import (
	"context"
	"fmt"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

type expiredSendStore interface {
	FindExpiredJobs(context.Context, time.Time, int) ([]send.ExpiredSendJob, error)
	FinishJob(context.Context, int64, send.JobStatus, *string, bool, *string, time.Time) error
	SetIntentStatus(context.Context, int64, send.IntentStatus, *string, *time.Time, time.Time) error
}

type quotaAccounting interface {
	ReleaseDaily(context.Context, int64, string) error
	IncrFailed(context.Context, int64, string) error
}

// SendLeaseReaper closes attempts whose worker lease expired while the
// platform result was unknown. It deliberately never creates a retry outbox;
// a later reconciliation capability can be added without weakening this
// fail-closed boundary (docs/15 §9, §20).
type SendLeaseReaper struct {
	sends expiredSendStore
	quota quotaAccounting
	tx    txManager
	limit int
	now   func() time.Time
}

func NewSendLeaseReaper(sends expiredSendStore, quota quotaAccounting, tx txManager, limit int) *SendLeaseReaper {
	if limit <= 0 {
		limit = 100
	}
	return &SendLeaseReaper{sends: sends, quota: quota, tx: tx, limit: limit, now: time.Now}
}

func (r *SendLeaseReaper) SetNow(now func() time.Time) { r.now = now }

// RunOnce returns the number of attempts closed in one transaction.
func (r *SendLeaseReaper) RunOnce(ctx context.Context) (int, error) {
	if r.sends == nil || r.quota == nil || r.tx == nil {
		return 0, apperr.New(apperr.CodeInternal, apperr.KindInternal, "send lease reaper is not configured")
	}
	at := time.Now()
	if r.now != nil {
		at = r.now()
	}
	count := 0
	err := r.tx.WithinTx(ctx, func(tctx context.Context) error {
		expired, err := r.sends.FindExpiredJobs(tctx, at, r.limit)
		if err != nil {
			return err
		}
		code := apperr.CodeOutcomeUnknown
		for _, item := range expired {
			if item.Job == nil || item.Intent == nil {
				return fmt.Errorf("send lease reaper: malformed expired job")
			}
			if err := r.sends.FinishJob(tctx, item.Job.ID, send.JobFailed, &code, false, nil, at); err != nil {
				return err
			}
			if err := r.sends.SetIntentStatus(tctx, item.Intent.ID, send.IntentFailed, &code, nil, at); err != nil {
				return err
			}
			if item.Intent.LocalDate != nil && *item.Intent.LocalDate != "" {
				if err := r.quota.ReleaseDaily(tctx, item.UserID, *item.Intent.LocalDate); err != nil {
					return err
				}
				if err := r.quota.IncrFailed(tctx, item.UserID, *item.Intent.LocalDate); err != nil {
					return err
				}
			}
			count++
		}
		return nil
	})
	return count, err
}
