package asynqworker

import (
	"context"
	"errors"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

type terminalJobStore interface {
	AppendEvent(context.Context, int64, job.JobEvent) error
	Finish(context.Context, int64, job.Status, *string, time.Time) error
}

// finishGenericJobFailure records the terminal error event and closes the Job
// even when the event write fails. Returning the event error still surfaces a
// broken history sink to the queue runner, while the terminal Job prevents a
// duplicate delivery from running the side effect again.
func finishGenericJobFailure(
	ctx context.Context,
	jobs terminalJobStore,
	claimed *job.Job,
	code string,
	now func() time.Time,
) error {
	eventErr := jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{
		EventType: "error", Payload: mustJSON(map[string]string{"code": code}), CreatedAt: now(),
	})
	finishErr := jobs.Finish(ctx, claimed.ID, job.StatusFailed, &code, now())
	return errors.Join(eventErr, finishErr)
}
