package asynqworker

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

type terminalJobStoreStub struct {
	eventErr  error
	finishErr error
	events    int
	finishes  int
}

func (s *terminalJobStoreStub) AppendEvent(context.Context, int64, job.JobEvent) error {
	s.events++
	return s.eventErr
}

func (s *terminalJobStoreStub) Finish(context.Context, int64, job.Status, *string, time.Time) error {
	s.finishes++
	return s.finishErr
}

func TestFinishGenericJobFailureClosesJobWhenEventWriteFails(t *testing.T) {
	eventErr := errors.New("event store unavailable")
	store := &terminalJobStoreStub{eventErr: eventErr}
	claimed := &job.Job{ID: 42}

	err := finishGenericJobFailure(context.Background(), store, claimed, "internal", time.Now)

	if !errors.Is(err, eventErr) {
		t.Fatalf("expected event error, got %v", err)
	}
	if store.events != 1 || store.finishes != 1 {
		t.Fatalf("expected event and finish attempts, got events=%d finishes=%d", store.events, store.finishes)
	}
}

func TestFinishGenericJobFailurePreservesBothErrors(t *testing.T) {
	eventErr := errors.New("event store unavailable")
	finishErr := errors.New("job store unavailable")
	store := &terminalJobStoreStub{eventErr: eventErr, finishErr: finishErr}

	err := finishGenericJobFailure(context.Background(), store, &job.Job{ID: 42}, "internal", time.Now)

	if !errors.Is(err, eventErr) || !errors.Is(err, finishErr) {
		t.Fatalf("expected both errors, got %v", err)
	}
}
