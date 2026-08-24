package asynqworker

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

var errCancellationConsumed = errors.New("job cancellation consumed")

type cancellationStore interface {
	IsCancelRequested(context.Context, int64) (bool, error)
	AppendEvent(context.Context, int64, job.JobEvent) error
	Finish(context.Context, int64, job.Status, *string, time.Time) error
}

// cancelIfRequested re-reads the DB flag immediately before a platform or
// other irreversible step. The API only requests cancellation; the worker is
// the sole writer of the cancelled terminal state (docs/15 §14).
func cancelIfRequested(ctx context.Context, jobs cancellationStore, claimed *job.Job, now func() time.Time) (bool, error) {
	if claimed.CancelRequestedAt == nil {
		requested, err := jobs.IsCancelRequested(ctx, claimed.ID)
		if err != nil {
			return false, err
		}
		if !requested {
			return false, nil
		}
	}
	if err := jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{
		EventType: "cancelled", Payload: json.RawMessage(`{"reason":"user_requested"}`), CreatedAt: now(),
	}); err != nil {
		return true, err
	}
	return true, jobs.Finish(ctx, claimed.ID, job.StatusCancelled, nil, now())
}

// callIfNotCancelled closes the final race between a cancellation check and
// an irreversible platform call. The callback is never invoked after the
// worker consumes a cancellation request.
func callIfNotCancelled(ctx context.Context, jobs cancellationStore, claimed *job.Job, now func() time.Time, call func() error) (bool, error) {
	cancelled, err := cancelIfRequested(ctx, jobs, claimed, now)
	if cancelled || err != nil {
		return cancelled, err
	}
	return false, call()
}
