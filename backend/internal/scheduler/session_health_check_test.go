package scheduler

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
)

type fakeSessionCheckAccounts struct {
	targets []account.SessionCheckTarget
	before  time.Time
	limit   int
}

func (f *fakeSessionCheckAccounts) ListStaleSessionCheckTargets(_ context.Context, before time.Time, limit int) ([]account.SessionCheckTarget, error) {
	f.before, f.limit = before, limit
	return f.targets, nil
}

type fakeSessionCheckJobs struct{ jobs []*job.Job }

func (f *fakeSessionCheckJobs) CreateJob(_ context.Context, item *job.Job) error {
	f.jobs = append(f.jobs, item)
	return nil
}

type fakeSessionCheckOutbox struct{ messages []outbox.Message }

func (f *fakeSessionCheckOutbox) Add(_ context.Context, message outbox.Message) error {
	f.messages = append(f.messages, message)
	return nil
}

func TestSessionHealthCheckRunnerEnqueuesStaleTargetsWithStableBucketDedupe(t *testing.T) {
	now := time.Date(2026, 8, 24, 12, 7, 0, 0, time.UTC)
	publicID := uuid.MustParse("00000000-0000-0000-0000-000000000042")
	accounts := &fakeSessionCheckAccounts{targets: []account.SessionCheckTarget{{
		AccountID: 42, PublicID: publicID, UserID: 7,
	}}}
	jobs := &fakeSessionCheckJobs{}
	relay := &fakeSessionCheckOutbox{}
	runner := NewSessionHealthCheckRunner(accounts, jobs, relay, fakeProbeTx{}, 30*time.Minute, 20)
	runner.SetNow(func() time.Time { return now })

	stats, err := runner.RunOnce(context.Background())
	if err != nil || stats.Scanned != 1 || stats.Enqueued != 1 {
		t.Fatalf("stats=%+v err=%v", stats, err)
	}
	if !accounts.before.Equal(now.Add(-30*time.Minute)) || accounts.limit != 20 {
		t.Fatalf("stale query args before=%v limit=%d", accounts.before, accounts.limit)
	}
	if len(jobs.jobs) != 1 || jobs.jobs[0].Type != "account.session_check.browser" || jobs.jobs[0].Status != job.StatusQueued {
		t.Fatalf("unexpected jobs: %+v", jobs.jobs)
	}
	if *jobs.jobs[0].UserID != 7 || *jobs.jobs[0].AccountID != 42 {
		t.Fatalf("job ownership was not preserved: %+v", jobs.jobs[0])
	}
	message := relay.messages[0]
	if message.Kind != outbox.KindSessionCheckBrowser || message.AggregateID != jobs.jobs[0].PublicID.String() {
		t.Fatalf("unexpected session check message: %+v", message)
	}
	var payload map[string]string
	if err := json.Unmarshal(message.Payload, &payload); err != nil || payload["job_id"] != jobs.jobs[0].PublicID.String() {
		t.Fatalf("unexpected payload: %s", message.Payload)
	}
	if message.DedupeKey != "job.platform.periodic.session_check:00000000-0000-0000-0000-000000000042:1787572800" {
		t.Fatalf("unexpected dedupe key: %s", message.DedupeKey)
	}
}

func TestSessionHealthCheckRunnerRequiresAllDependencies(t *testing.T) {
	runner := NewSessionHealthCheckRunner(nil, nil, nil, nil, time.Minute, 1)
	if _, err := runner.RunOnce(context.Background()); err == nil {
		t.Fatal("expected configuration error")
	}
}
