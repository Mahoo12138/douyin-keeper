package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
)

const DefaultSessionHealthCheckInterval = 30 * time.Minute

type SessionHealthCheckStats struct {
	Scanned  int
	Enqueued int
}

// SessionHealthCheckRunner periodically validates bound account sessions via
// the browser worker. It only creates database jobs and transactional-outbox
// rows; platform calls remain in the worker (docs/15 §3).
type SessionHealthCheckRunner struct {
	accounts account.SessionCheckRepository
	jobs     account.JobCreator
	outbox   outbox.Outbox
	tx       txManager
	interval time.Duration
	limit    int
	now      func() time.Time
}

func NewSessionHealthCheckRunner(accounts account.SessionCheckRepository, jobs account.JobCreator,
	relay outbox.Outbox, tx txManager, interval time.Duration, limit int) *SessionHealthCheckRunner {
	if interval <= 0 {
		interval = DefaultSessionHealthCheckInterval
	}
	if limit <= 0 {
		limit = 100
	}
	return &SessionHealthCheckRunner{accounts: accounts, jobs: jobs, outbox: relay, tx: tx,
		interval: interval, limit: limit, now: time.Now}
}

func (r *SessionHealthCheckRunner) SetNow(now func() time.Time) { r.now = now }

func (r *SessionHealthCheckRunner) RunOnce(ctx context.Context) (SessionHealthCheckStats, error) {
	if r == nil || r.accounts == nil || r.jobs == nil || r.outbox == nil || r.tx == nil {
		return SessionHealthCheckStats{}, apperr.New(apperr.CodeInternal, apperr.KindInternal,
			"session health check scheduler is not configured")
	}
	now := time.Now()
	if r.now != nil {
		now = r.now()
	}
	targets, err := r.accounts.ListStaleSessionCheckTargets(ctx, now.Add(-r.interval), r.limit)
	if err != nil {
		return SessionHealthCheckStats{}, err
	}
	stats := SessionHealthCheckStats{Scanned: len(targets)}
	bucket := strconv.FormatInt(now.UTC().Truncate(r.interval).Unix(), 10)
	for _, target := range targets {
		target := target
		err := r.tx.WithinTx(ctx, func(tctx context.Context) error {
			userID := target.UserID
			accountID := target.AccountID
			j := &job.Job{
				PublicID: uuid.New(), UserID: &userID, AccountID: &accountID,
				Type: "account.session_check.browser", Status: job.StatusQueued,
				CreatedAt: now,
			}
			if err := r.jobs.CreateJob(tctx, j); err != nil {
				return err
			}
			payload, err := json.Marshal(map[string]string{"job_id": j.PublicID.String()})
			if err != nil {
				return fmt.Errorf("marshal session check payload: %w", err)
			}
			return r.outbox.Add(tctx, outbox.Message{
				Kind: outbox.KindSessionCheckBrowser, AggregateType: "job",
				AggregateID: j.PublicID.String(), Payload: payload, AvailableAt: now,
				DedupeKey: "job.platform.periodic.session_check:" + target.PublicID.String() + ":" + bucket,
			})
		})
		if err != nil {
			return stats, err
		}
		stats.Enqueued++
	}
	return stats, nil
}
