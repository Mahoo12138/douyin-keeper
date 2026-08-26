package asynqworker

import (
	"context"
	"encoding/json"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

type jobEventAppender interface {
	AppendEvent(context.Context, int64, job.JobEvent) error
}

func appendSMSCodeInvalidEvent(ctx context.Context, jobs jobEventAppender, jobID int64, now func() time.Time) error {
	return jobs.AppendEvent(ctx, jobID, job.JobEvent{
		EventType: "sms_code_invalid", Payload: json.RawMessage(`{}`), CreatedAt: now(),
	})
}
