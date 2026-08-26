package scheduler

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

type fakeDueTasks struct{ items []*task.SparkTask }

func (f fakeDueTasks) ListDue(context.Context, time.Time, int) ([]*task.SparkTask, error) {
	return f.items, nil
}

type fakeIntentStore struct {
	nextID   int64
	seen     map[string]bool
	intents  []*send.SendIntent
	jobs     []*send.SendJob
	statuses []fakeStatus
}

type fakeStatus struct {
	id     int64
	status send.IntentStatus
	code   string
}

func (f *fakeIntentStore) CreateScheduledIntent(_ context.Context, in *send.SendIntent) (bool, error) {
	key := strconv.FormatInt(*in.TaskID, 10) + ":" + *in.LocalDate
	if f.seen[key] {
		return false, nil
	}
	f.seen[key] = true
	f.nextID++
	in.ID = f.nextID
	f.intents = append(f.intents, in)
	return true, nil
}

func (f *fakeIntentStore) CreateJob(_ context.Context, job *send.SendJob) error {
	f.nextID++
	job.ID = f.nextID
	f.jobs = append(f.jobs, job)
	return nil
}

func (f *fakeIntentStore) SetIntentLastJob(context.Context, int64, int64) error { return nil }

func (f *fakeIntentStore) SetIntentStatus(_ context.Context, id int64, status send.IntentStatus, code *string, _ *time.Time, _ time.Time) error {
	value := ""
	if code != nil {
		value = *code
	}
	f.statuses = append(f.statuses, fakeStatus{id: id, status: status, code: value})
	return nil
}

type fakeGate struct {
	decision entitlement.AuthorizationDecision
	err      error
}

func (f fakeGate) Authorize(context.Context, entitlement.AuthorizationRequest) (entitlement.AuthorizationDecision, error) {
	return f.decision, f.err
}

type fakeQuota struct {
	calls int
	err   error
}

func (f *fakeQuota) ReserveDaily(context.Context, int64, string) error {
	f.calls++
	return f.err
}

type fakeOutbox struct{ messages []outbox.Message }

func (f *fakeOutbox) Add(_ context.Context, m outbox.Message) error {
	f.messages = append(f.messages, m)
	return nil
}

type failingOutbox struct{ err error }

func (failingOutbox) Add(context.Context, outbox.Message) error {
	return errors.New("outbox unavailable")
}

type fakeTx struct{}

func (fakeTx) WithinTx(ctx context.Context, fn func(context.Context) error) error { return fn(ctx) }

func testTask() *task.SparkTask {
	return &task.SparkTask{ID: 10, UserID: 20, AccountID: 30, FriendID: 40}
}

func TestTickRunnerCreatesOneScheduledIntentPerLocalDay(t *testing.T) {
	store := &fakeIntentStore{seen: map[string]bool{}}
	quota := &fakeQuota{}
	relay := &fakeOutbox{}
	runner := NewTickRunner(fakeDueTasks{items: []*task.SparkTask{testTask()}}, store,
		fakeGate{decision: entitlement.AuthorizationDecision{Allowed: true}}, quota, relay, fakeTx{}, 10)
	runner.now = func() time.Time { return time.Date(2026, 8, 24, 1, 0, 0, 0, time.UTC) }

	stats, err := runner.RunOnce(context.Background())
	if err != nil || stats.Scanned != 1 || stats.Created != 1 || stats.Skipped != 0 {
		t.Fatalf("first tick stats=%+v err=%v", stats, err)
	}
	if len(store.jobs) != 1 || quota.calls != 1 || len(relay.messages) != 1 {
		t.Fatalf("created job=%d quota_calls=%d outbox=%d", len(store.jobs), quota.calls, len(relay.messages))
	}
	var payload map[string]string
	if err := json.Unmarshal(relay.messages[0].Payload, &payload); err != nil || payload["job_id"] == "" {
		t.Fatalf("invalid dispatch payload: %s", relay.messages[0].Payload)
	}

	stats, err = runner.RunOnce(context.Background())
	if err != nil || stats.Created != 0 || quota.calls != 1 || len(relay.messages) != 1 {
		t.Fatalf("duplicate tick stats=%+v err=%v quota_calls=%d outbox=%d", stats, err, quota.calls, len(relay.messages))
	}
	if store.intents[0].Status != send.IntentPending || store.jobs[0].Status != send.JobQueued {
		t.Fatalf("unexpected initial state intent=%s job=%s", store.intents[0].Status, store.jobs[0].Status)
	}
}

func TestTickRunnerSkipsWhenGateRejects(t *testing.T) {
	store := &fakeIntentStore{seen: map[string]bool{}}
	relay := &fakeOutbox{}
	quota := &fakeQuota{}
	runner := NewTickRunner(fakeDueTasks{items: []*task.SparkTask{testTask()}}, store,
		fakeGate{decision: entitlement.AuthorizationDecision{Allowed: false, ReasonCode: apperr.CodeEntitlementExpired}}, quota, relay, fakeTx{}, 10)

	stats, err := runner.RunOnce(context.Background())
	if err != nil || stats.Created != 1 || stats.Skipped != 1 {
		t.Fatalf("stats=%+v err=%v", stats, err)
	}
	if quota.calls != 0 || len(store.jobs) != 0 || len(relay.messages) != 0 {
		t.Fatalf("gate rejection performed side effects quota=%d jobs=%d outbox=%d", quota.calls, len(store.jobs), len(relay.messages))
	}
	if len(store.statuses) != 1 || store.statuses[0].status != send.IntentSkipped || store.statuses[0].code != apperr.CodeEntitlementExpired {
		t.Fatalf("statuses=%+v", store.statuses)
	}
}

func TestTickRunnerSkipsWhenDailyQuotaIsUnavailable(t *testing.T) {
	store := &fakeIntentStore{seen: map[string]bool{}}
	quota := &fakeQuota{err: apperr.New(apperr.CodeDailySendQuotaExceeded, apperr.KindQuota, "full")}
	runner := NewTickRunner(fakeDueTasks{items: []*task.SparkTask{testTask()}}, store,
		fakeGate{decision: entitlement.AuthorizationDecision{Allowed: true}}, quota, &fakeOutbox{}, fakeTx{}, 10)

	stats, err := runner.RunOnce(context.Background())
	if err != nil || stats.Created != 1 || stats.Skipped != 1 {
		t.Fatalf("stats=%+v err=%v", stats, err)
	}
	if len(store.jobs) != 0 || len(store.statuses) != 1 || store.statuses[0].code != apperr.CodeDailySendQuotaExceeded {
		t.Fatalf("jobs=%d statuses=%+v", len(store.jobs), store.statuses)
	}
}

func TestTickRunnerDoesNotReportRolledBackMutationCounts(t *testing.T) {
	store := &fakeIntentStore{seen: map[string]bool{}}
	runner := NewTickRunner(fakeDueTasks{items: []*task.SparkTask{testTask()}}, store,
		fakeGate{decision: entitlement.AuthorizationDecision{Allowed: true}}, &fakeQuota{}, failingOutbox{}, fakeTx{}, 10)

	stats, err := runner.RunOnce(context.Background())
	if err == nil || stats.Created != 0 || stats.Skipped != 0 {
		t.Fatalf("stats=%+v err=%v, want zero committed mutations", stats, err)
	}
}

func TestSchedulerSkipCodeDoesNotHideDatabaseErrors(t *testing.T) {
	if _, ok := schedulerSkipCode(errors.New("db down")); ok {
		t.Fatal("plain database error must be retried, not converted to skipped")
	}
	if code, ok := schedulerSkipCode(apperr.New(apperr.CodeEntitlementRequired, apperr.KindForbidden, "missing")); !ok || code != apperr.CodeEntitlementRequired {
		t.Fatalf("code=%q ok=%v", code, ok)
	}
}
