package asynqworker

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

type fakeCancellationStore struct {
	requested bool
	events    []job.JobEvent
	status    job.Status
}

func (f *fakeCancellationStore) IsCancelRequested(context.Context, int64) (bool, error) {
	return f.requested, nil
}

func (f *fakeCancellationStore) AppendEvent(_ context.Context, _ int64, event job.JobEvent) error {
	f.events = append(f.events, event)
	return nil
}

func (f *fakeCancellationStore) Finish(_ context.Context, _ int64, status job.Status, _ *string, _ time.Time) error {
	f.status = status
	return nil
}

func TestCancelIfRequestedFinishesWorkerJob(t *testing.T) {
	store := &fakeCancellationStore{requested: true}
	claimed := &job.Job{ID: 7, PublicID: uuid.New(), Status: job.StatusRunning}
	done, err := cancelIfRequested(context.Background(), store, claimed,
		func() time.Time { return time.Date(2026, 8, 24, 1, 0, 0, 0, time.UTC) })
	if err != nil || !done {
		t.Fatalf("done=%t err=%v", done, err)
	}
	if store.status != job.StatusCancelled || len(store.events) != 1 || store.events[0].EventType != "cancelled" {
		t.Fatalf("status=%s events=%+v", store.status, store.events)
	}
}

func TestCancelIfRequestedLeavesActiveJobAlone(t *testing.T) {
	store := &fakeCancellationStore{}
	claimed := &job.Job{ID: 8, PublicID: uuid.New(), Status: job.StatusRunning}
	done, err := cancelIfRequested(context.Background(), store, claimed, time.Now)
	if err != nil || done || store.status != "" || len(store.events) != 0 {
		t.Fatalf("done=%t err=%v status=%s events=%d", done, err, store.status, len(store.events))
	}
}

func TestCallIfNotCancelledSkipsPlatformCall(t *testing.T) {
	store := &fakeCancellationStore{requested: true}
	claimed := &job.Job{ID: 9, PublicID: uuid.New(), Status: job.StatusRunning}
	called := false
	cancelled, err := callIfNotCancelled(context.Background(), store, claimed, time.Now, func() error {
		called = true
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if !cancelled || called || store.status != job.StatusCancelled {
		t.Fatalf("cancelled=%t platform called=%t status=%s", cancelled, called, store.status)
	}
}

func TestCallIfNotCancelledInvokesPlatformCallWhenActive(t *testing.T) {
	store := &fakeCancellationStore{}
	claimed := &job.Job{ID: 10, PublicID: uuid.New(), Status: job.StatusRunning}
	called := false
	wantErr := context.DeadlineExceeded
	cancelled, err := callIfNotCancelled(context.Background(), store, claimed, time.Now, func() error {
		called = true
		return wantErr
	})
	if err != wantErr || cancelled || !called {
		t.Fatalf("cancelled=%t err=%v called=%t, want callback error and invocation", cancelled, err, called)
	}
}
