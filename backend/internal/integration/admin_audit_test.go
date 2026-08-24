package integration

import (
	"context"
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminAuditRepoListsSummaryWithoutRawDetail(t *testing.T) {
	ctx := context.Background()
	actorID := newUser(t)
	resourceID := "fingerprint-integration"
	if err := postgres.NewEntitlementRepo(pool).Record(ctx, &actorID, "integration.audit.redact", "card_code", resourceID, map[string]any{
		"code": "secret-must-not-be-read",
	}); err != nil {
		t.Fatal(err)
	}

	items, err := postgres.NewAdminRepo(pool, nil).ListAuditSummaries(ctx, admin.AuditFilter{Action: "integration.audit.redact", ResourceType: "card_code", Actor: "entuser", Limit: 10})
	if err != nil || len(items) == 0 {
		t.Fatalf("audit summaries = %+v, err = %v", items, err)
	}
	item := items[0]
	if item.Action != "integration.audit.redact" || item.ResourceType != "card_code" || item.ResourceID == nil || *item.ResourceID != resourceID || !item.HasDetail {
		t.Fatalf("audit summary = %+v", item)
	}
}
