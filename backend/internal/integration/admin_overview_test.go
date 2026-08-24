package integration

import (
	"context"
	"testing"

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
