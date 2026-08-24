package integration

import (
	"context"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
)

func TestOutboxClaimPublishRoundTrip(t *testing.T) {
	ctx := context.Background()
	clearIntegrationOutbox(t, ctx)
	repo := postgres.NewOutboxRepo(pool)

	msg := outbox.Message{
		Kind: outbox.KindSendDispatch, AggregateType: "send_intent",
		AggregateID: newUUID().String(), DedupeKey: "test:" + newUUID().String(),
	}
	// Add inside a tx so the contract (outbox + domain row atomicity) holds.
	tx := postgres.NewTxManager(pool)
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return repo.Add(tctx, msg)
	}); err != nil {
		t.Fatalf("add: %v", err)
	}
	pending, err := repo.ClaimPending(ctx, 10, "tester", 30*time.Second)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if len(pending) != 1 || pending[0].Kind != outbox.KindSendDispatch {
		t.Fatalf("expected exactly one pending message, got %d", len(pending))
	}
	if err := repo.MarkPublished(ctx, pending[0].ID, "tester"); err != nil {
		t.Fatalf("publish: %v", err)
	}
	// A second claim must not re-claim the published row.
	again, err := repo.ClaimPending(ctx, 10, "tester2", 30*time.Second)
	if err != nil {
		t.Fatalf("claim2: %v", err)
	}
	if len(again) != 0 {
		t.Fatalf("expected no pending rows after publish, got %d", len(again))
	}
}

func TestOutboxDedupeKeyAbsorbed(t *testing.T) {
	ctx := context.Background()
	clearIntegrationOutbox(t, ctx)
	repo := postgres.NewOutboxRepo(pool)
	key := "dedupe:" + newUUID().String()

	msg := outbox.Message{Kind: outbox.KindCapabilityProbe, AggregateID: "a", DedupeKey: key}
	if err := repo.Add(ctx, msg); err != nil {
		t.Fatalf("add 1: %v", err)
	}
	// Second add with same key is absorbed by UNIQUE(dedupe_key).
	if err := repo.Add(ctx, msg); err != nil {
		t.Fatalf("add 2: %v", err)
	}
	pending, err := repo.ClaimPending(ctx, 10, "tester", 30*time.Second)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	// Both adds collapsed into exactly one pending row (ON CONFLICT DO NOTHING).
	n := 0
	for _, p := range pending {
		if p.Kind == outbox.KindCapabilityProbe {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("expected dedupe to collapse to one row, got %d", n)
	}
}

func clearIntegrationOutbox(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := pool.Exec(ctx, `DELETE FROM queue_outbox`); err != nil {
		t.Fatalf("clear integration outbox: %v", err)
	}
}
