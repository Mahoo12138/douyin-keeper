package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminOverviewRepoReturnsAggregatedOperationalSummary(t *testing.T) {
	summary, err := postgres.NewAdminRepo(pool, nil).GetOverviewSummary(context.Background())
	if err != nil {
		t.Fatalf("GetOverviewSummary() error = %v", err)
	}
	if summary.ObservedAt.IsZero() || summary.WorkersTotal != 3 {
		t.Fatalf("overview runtime = %+v", summary)
	}
	if summary.ActiveUsers < 0 || summary.DAU < 0 || summary.ActiveAccounts < 0 || summary.RiskAccounts < 0 {
		t.Fatalf("overview counts must be non-negative: %+v", summary)
	}
}

func TestAdminRuntimeReportsOutboxDeadLetters(t *testing.T) {
	ctx := context.Background()
	before, err := postgres.NewAdminRepo(pool, nil).GetRuntimeSummary(ctx)
	if err != nil {
		t.Fatalf("baseline GetRuntimeSummary() error = %v", err)
	}
	createdAt := time.Now().UTC().Add(-11 * time.Minute).Truncate(time.Microsecond)
	publicID := uuid.New()
	if _, err := pool.Exec(ctx, `
		INSERT INTO queue_outbox (public_id, kind, aggregate_type, aggregate_id, payload_json, status, attempts, dedupe_key, created_at)
		VALUES ($1,'send.dispatch','integration','dead-letter-test','{}'::jsonb,'dead',5,$2,$3)`,
		publicID, "integration:dead:"+publicID.String(), createdAt); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM queue_outbox WHERE public_id = $1`, publicID) }()

	summary, err := postgres.NewAdminRepo(pool, nil).GetRuntimeSummary(ctx)
	if err != nil {
		t.Fatalf("GetRuntimeSummary() error = %v", err)
	}
	if summary.OutboxDead != before.OutboxDead+1 || summary.OutboxPending != before.OutboxPending || summary.OutboxPublishing != before.OutboxPublishing {
		t.Fatalf("outbox counts before=%+v after=%+v", before, summary)
	}
	if summary.OutboxOldestDeadAt == nil || summary.OutboxOldestDeadAt.After(createdAt) {
		t.Fatalf("oldest dead outbox = %v, want no later than %v", summary.OutboxOldestDeadAt, createdAt)
	}
}
