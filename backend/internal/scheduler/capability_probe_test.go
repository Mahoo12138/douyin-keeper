package scheduler

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
)

type fakeProbeAccounts struct {
	targets []capability.ProbeTarget
	before  time.Time
	limit   int
}

func (f *fakeProbeAccounts) ListStaleProbeTargets(_ context.Context, before time.Time, limit int) ([]capability.ProbeTarget, error) {
	f.before, f.limit = before, limit
	return f.targets, nil
}

type fakeProbeOutbox struct{ messages []outbox.Message }

func (f *fakeProbeOutbox) Add(_ context.Context, message outbox.Message) error {
	f.messages = append(f.messages, message)
	return nil
}

type fakeProbeTx struct{}

func (fakeProbeTx) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

func TestCapabilityProbeRunnerEnqueuesStaleTargetsWithStableBucketDedupe(t *testing.T) {
	now := time.Date(2026, 8, 24, 12, 7, 0, 0, time.UTC)
	accounts := &fakeProbeAccounts{targets: []capability.ProbeTarget{{AccountID: 42, PublicID: uuid.MustParse("00000000-0000-0000-0000-000000000042")}}}
	relay := &fakeProbeOutbox{}
	runner := NewCapabilityProbeRunner(accounts, relay, fakeProbeTx{}, 10*time.Minute, 20)
	runner.SetNow(func() time.Time { return now })
	stats, err := runner.RunOnce(context.Background())
	if err != nil || stats.Scanned != 1 || stats.Enqueued != 1 {
		t.Fatalf("stats=%+v err=%v", stats, err)
	}
	if !accounts.before.Equal(now.Add(-10*time.Minute)) || accounts.limit != 20 {
		t.Fatalf("stale query args before=%v limit=%d", accounts.before, accounts.limit)
	}
	message := relay.messages[0]
	if message.Kind != outbox.KindCapabilityProbe || message.AggregateID != accounts.targets[0].PublicID.String() {
		t.Fatalf("unexpected probe message: %+v", message)
	}
	var payload map[string]int64
	if err := json.Unmarshal(message.Payload, &payload); err != nil || payload["account_id"] != 42 {
		t.Fatalf("unexpected probe payload: %s", message.Payload)
	}
	if message.DedupeKey != "capability.probe.periodic:00000000-0000-0000-0000-000000000042:1787572800" {
		t.Fatalf("unexpected dedupe key: %s", message.DedupeKey)
	}
}
