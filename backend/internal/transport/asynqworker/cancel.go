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

// cancelIfRequestedWithCleanup is the binding-specific cancellation path. A
// new binding reserves an account-quota slot before the worker starts; when a
// user cancels, close the Job and release that reservation in one transaction.
func cancelIfRequestedWithCleanup(
	ctx context.Context,
	jobs cancellationStore,
	tx job.TxManager,
	claimed *job.Job,
	now func() time.Time,
	cleanup func(context.Context) error,
) (bool, error) {
	if claimed.CancelRequestedAt == nil {
		requested, err := jobs.IsCancelRequested(ctx, claimed.ID)
		if err != nil {
			return false, err
		}
		if !requested {
			return false, nil
		}
	}
	if tx == nil || cleanup == nil {
		cancelled, err := cancelIfRequested(ctx, jobs, claimed, now)
		if !cancelled || err != nil {
			return cancelled, err
		}
		// Re-login jobs do not reserve quota, so cleanup is intentionally nil.
		// Cancellation still needs to finish the Job, but must not call a nil
		// release callback and panic the Asynq worker.
		if cleanup == nil {
			return true, nil
		}
		return true, cleanup(ctx)
	}
	err := tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := jobs.AppendEvent(tctx, claimed.ID, job.JobEvent{
			EventType: "cancelled", Payload: json.RawMessage(`{"reason":"user_requested"}`), CreatedAt: now(),
		}); err != nil {
			return err
		}
		if err := jobs.Finish(tctx, claimed.ID, job.StatusCancelled, nil, now()); err != nil {
			return err
		}
		return cleanup(tctx)
	})
	return true, err
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

func callIfNotCancelledWithCleanup(
	ctx context.Context,
	jobs cancellationStore,
	tx job.TxManager,
	claimed *job.Job,
	now func() time.Time,
	cleanup func(context.Context) error,
	call func() error,
) (bool, error) {
	cancelled, err := cancelIfRequestedWithCleanup(ctx, jobs, tx, claimed, now, cleanup)
	if cancelled || err != nil {
		return cancelled, err
	}
	return false, call()
}
