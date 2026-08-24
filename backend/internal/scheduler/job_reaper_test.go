package scheduler

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

type fakeExpiredJobStore struct {
	items    []*job.Job
	finished []struct {
		id     int64
		status job.Status
		code   string
	}
	events []job.JobEvent
}

func (f *fakeExpiredJobStore) FindExpiredLeases(context.Context, time.Time, int) ([]*job.Job, error) {
	return f.items, nil
}

func (f *fakeExpiredJobStore) FinishExpired(_ context.Context, id int64, status job.Status, code *string, _ time.Time) (bool, error) {
	value := ""
	if code != nil {
		value = *code
	}
	f.finished = append(f.finished, struct {
		id     int64
		status job.Status
		code   string
	}{id: id, status: status, code: value})
	return true, nil
}

func (f *fakeExpiredJobStore) AppendEvent(_ context.Context, _ int64, event job.JobEvent) error {
	f.events = append(f.events, event)
	return nil
}

type fakeBindingCleanup struct {
	account *account.Account
	status  account.BindingStatus
}

func (f *fakeBindingCleanup) GetByID(context.Context, int64) (*account.Account, error) {
	return f.account, nil
}

func (f *fakeBindingCleanup) SetBindingStatus(_ context.Context, _ int64, status account.BindingStatus) error {
	f.status = status
	return nil
}

func TestJobLeaseReaperFailsClosedAndReleasesBindingState(t *testing.T) {
	store := &fakeExpiredJobStore{items: []*job.Job{{
		ID: 10, PublicID: uuid.New(), Type: "account.bind.qr", AccountID: int64Ptr(20),
		Status: job.StatusRunning,
	}}}
	accounts := &fakeBindingCleanup{account: &account.Account{ID: 20, BindingStatus: account.BindingBinding}}
	reaper := NewJobLeaseReaper(store, accounts, fakeTx{}, 10)
	reaper.SetNow(func() time.Time { return time.Date(2026, 8, 24, 1, 0, 0, 0, time.UTC) })

	count, err := reaper.RunOnce(context.Background())
	if err != nil || count != 1 {
		t.Fatalf("count=%d err=%v", count, err)
	}
	if len(store.finished) != 1 || store.finished[0].status != job.StatusFailed || store.finished[0].code != apperr.CodeOutcomeUnknown {
		t.Fatalf("finished=%+v", store.finished)
	}
	if accounts.status != account.BindingUnbound {
		t.Fatalf("binding cleanup status=%q, want unbound", accounts.status)
	}
	if len(store.events) != 1 || store.events[0].EventType != "error" {
		t.Fatalf("events=%+v", store.events)
	}
	var payload map[string]string
	if err := json.Unmarshal(store.events[0].Payload, &payload); err != nil || payload["reason"] != "lease_expired" {
		t.Fatalf("event payload=%s err=%v", store.events[0].Payload, err)
	}
}

func TestJobLeaseReaperHonorsCancellationRequest(t *testing.T) {
	requested := time.Date(2026, 8, 24, 0, 0, 0, 0, time.UTC)
	store := &fakeExpiredJobStore{items: []*job.Job{{
		ID: 11, PublicID: uuid.New(), Type: "account.session_check.browser", Status: job.StatusWaiting,
		CancelRequestedAt: &requested,
	}}}
	reaper := NewJobLeaseReaper(store, nil, fakeTx{}, 10)

	count, err := reaper.RunOnce(context.Background())
	if err != nil || count != 1 {
		t.Fatalf("count=%d err=%v", count, err)
	}
	if len(store.finished) != 1 || store.finished[0].status != job.StatusCancelled || store.finished[0].code != "" {
		t.Fatalf("finished=%+v", store.finished)
	}
	if len(store.events) != 1 || store.events[0].EventType != "cancelled" {
		t.Fatalf("events=%+v", store.events)
	}
}

func int64Ptr(value int64) *int64 { return &value }
