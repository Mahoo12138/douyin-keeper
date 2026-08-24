package scheduler

import (
	"context"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

type fakeExpiredStore struct {
	items    []send.ExpiredSendJob
	finished []struct {
		id   int64
		code string
	}
	statuses []struct {
		id   int64
		code string
	}
}

func (f *fakeExpiredStore) FindExpiredJobs(context.Context, time.Time, int) ([]send.ExpiredSendJob, error) {
	items := f.items
	f.items = nil
	return items, nil
}

func (f *fakeExpiredStore) FinishJob(_ context.Context, id int64, _ send.JobStatus, code *string, _ bool, _ *string, _ time.Time) error {
	value := ""
	if code != nil {
		value = *code
	}
	f.finished = append(f.finished, struct {
		id   int64
		code string
	}{id: id, code: value})
	return nil
}

func (f *fakeExpiredStore) SetIntentStatus(_ context.Context, id int64, _ send.IntentStatus, code *string, _ *time.Time, _ time.Time) error {
	value := ""
	if code != nil {
		value = *code
	}
	f.statuses = append(f.statuses, struct {
		id   int64
		code string
	}{id: id, code: value})
	return nil
}

type fakeQuotaAccounting struct{ releases, failures int }

func (f *fakeQuotaAccounting) ReleaseDaily(context.Context, int64, string) error {
	f.releases++
	return nil
}

func (f *fakeQuotaAccounting) IncrFailed(context.Context, int64, string) error {
	f.failures++
	return nil
}

func TestSendLeaseReaperFailsClosedWithoutRetry(t *testing.T) {
	date := "2026-08-24"
	store := &fakeExpiredStore{items: []send.ExpiredSendJob{{
		Job:    &send.SendJob{ID: 11, Status: send.JobRunning},
		Intent: &send.SendIntent{ID: 21, LocalDate: &date, Status: send.IntentRunning},
		UserID: 31,
	}}}
	quota := &fakeQuotaAccounting{}
	reaper := NewSendLeaseReaper(store, quota, fakeTx{}, 10)
	reaper.SetNow(func() time.Time { return time.Date(2026, 8, 24, 1, 2, 3, 0, time.UTC) })

	count, err := reaper.RunOnce(context.Background())
	if err != nil || count != 1 {
		t.Fatalf("count=%d err=%v", count, err)
	}
	if len(store.finished) != 1 || store.finished[0].code != apperr.CodeOutcomeUnknown {
		t.Fatalf("finished=%+v", store.finished)
	}
	if len(store.statuses) != 1 || store.statuses[0].code != apperr.CodeOutcomeUnknown {
		t.Fatalf("statuses=%+v", store.statuses)
	}
	if quota.releases != 1 || quota.failures != 1 {
		t.Fatalf("quota releases=%d failures=%d", quota.releases, quota.failures)
	}
	if count, err := reaper.RunOnce(context.Background()); err != nil || count != 0 {
		t.Fatalf("reaper repeated count=%d err=%v", count, err)
	}
}
