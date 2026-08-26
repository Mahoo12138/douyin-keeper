package scheduler

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

type fakeRetryStore struct {
	due      []send.RetryDueIntent
	counts   map[int64]int
	jobs     []*send.SendJob
	statuses []struct {
		id     int64
		status send.IntentStatus
		code   string
	}
}

func (f *fakeRetryStore) FindRetryDue(context.Context, time.Time, int) ([]send.RetryDueIntent, error) {
	due := f.due
	f.due = nil
	return due, nil
}

func (f *fakeRetryStore) CountJobsForIntent(_ context.Context, id int64) (int, error) {
	return f.counts[id], nil
}

func (f *fakeRetryStore) CreateJob(_ context.Context, job *send.SendJob) error {
	job.ID = int64(len(f.jobs) + 1)
	f.jobs = append(f.jobs, job)
	return nil
}

func (f *fakeRetryStore) SetIntentLastJob(context.Context, int64, int64) error { return nil }

func (f *fakeRetryStore) SetIntentStatus(_ context.Context, id int64, status send.IntentStatus, code *string, _ *time.Time, _ time.Time) error {
	value := ""
	if code != nil {
		value = *code
	}
	f.statuses = append(f.statuses, struct {
		id     int64
		status send.IntentStatus
		code   string
	}{id: id, status: status, code: value})
	return nil
}

func retryDueIntent() send.RetryDueIntent {
	date := "2026-08-24"
	return send.RetryDueIntent{Intent: &send.SendIntent{
		ID: 9, PublicID: uuid.New(), AccountID: 10, FriendID: 11,
		LocalDate: &date, ErrorCode: stringPtr(apperr.CodeNetworkTimeout),
	}, UserID: 12}
}

func stringPtr(value string) *string { return &value }

func TestRetryRunnerCreatesFreshAttempt(t *testing.T) {
	store := &fakeRetryStore{due: []send.RetryDueIntent{retryDueIntent()}, counts: map[int64]int{9: 1}}
	relay := &fakeOutbox{}
	quota := &fakeQuotaAccounting{}
	runner := NewRetryRunner(store, quota, relay, fakeTx{}, 10)
	runner.SetNow(func() time.Time { return time.Date(2026, 8, 24, 1, 0, 0, 0, time.UTC) })

	stats, err := runner.RunOnce(context.Background())
	if err != nil || stats.Scanned != 1 || stats.Requeued != 1 || stats.Exhausted != 0 {
		t.Fatalf("stats=%+v err=%v", stats, err)
	}
	if len(store.jobs) != 1 || store.jobs[0].Attempt != 2 || len(relay.messages) != 1 {
		t.Fatalf("jobs=%+v outbox=%d", store.jobs, len(relay.messages))
	}
	if quota.releases != 0 || quota.failures != 0 {
		t.Fatalf("retry released quota releases=%d failures=%d", quota.releases, quota.failures)
	}
	if store.statuses[0].status != send.IntentQueued {
		t.Fatalf("status=%+v", store.statuses)
	}
}

func TestRetryRunnerExhaustionClosesIntentAndReleasesQuota(t *testing.T) {
	store := &fakeRetryStore{due: []send.RetryDueIntent{retryDueIntent()}, counts: map[int64]int{9: send.MaxSendAttempts}}
	quota := &fakeQuotaAccounting{}
	runner := NewRetryRunner(store, quota, &fakeOutbox{}, fakeTx{}, 10)

	stats, err := runner.RunOnce(context.Background())
	if err != nil || stats.Exhausted != 1 || stats.Requeued != 0 {
		t.Fatalf("stats=%+v err=%v", stats, err)
	}
	if len(store.jobs) != 0 || quota.releases != 1 || quota.failures != 1 {
		t.Fatalf("jobs=%d quota releases=%d failures=%d", len(store.jobs), quota.releases, quota.failures)
	}
	if len(store.statuses) != 1 || store.statuses[0].status != send.IntentFailed {
		t.Fatalf("statuses=%+v", store.statuses)
	}
}

func TestRetryRunnerDoesNotReportRolledBackMutationCounts(t *testing.T) {
	store := &fakeRetryStore{due: []send.RetryDueIntent{retryDueIntent()}, counts: map[int64]int{9: 1}}
	runner := NewRetryRunner(store, &fakeQuotaAccounting{}, failingOutbox{}, fakeTx{}, 10)

	stats, err := runner.RunOnce(context.Background())
	if err == nil || stats.Requeued != 0 || stats.Exhausted != 0 || stats.Scanned != 1 {
		t.Fatalf("stats=%+v err=%v, want scanned=1 and zero committed mutations", stats, err)
	}
}
