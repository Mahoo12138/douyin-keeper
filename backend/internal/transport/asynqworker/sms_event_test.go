package asynqworker

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

type smsEventAppenderStub struct {
	err   error
	event job.JobEvent
}

func (s *smsEventAppenderStub) AppendEvent(_ context.Context, _ int64, event job.JobEvent) error {
	s.event = event
	return s.err
}

func TestAppendSMSCodeInvalidEventPreservesStoreError(t *testing.T) {
	wantErr := errors.New("job event store unavailable")
	store := &smsEventAppenderStub{err: wantErr}

	err := appendSMSCodeInvalidEvent(context.Background(), store, 42, time.Now)

	if !errors.Is(err, wantErr) {
		t.Fatalf("appendSMSCodeInvalidEvent() error = %v, want %v", err, wantErr)
	}
	if store.event.EventType != "sms_code_invalid" || string(store.event.Payload) != `{}` {
		t.Fatalf("unexpected event: %+v", store.event)
	}
}
