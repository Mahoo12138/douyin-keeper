package httpapi

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
)

func TestAdminEntitlementViewsExposeSummariesOnly(t *testing.T) {
	now := time.Date(2026, 8, 24, 9, 0, 0, 0, time.UTC)
	plan := adminEntitlementPlanViewFrom(entitlement.Plan{
		PublicID: uuid.MustParse("77777777-7777-7777-7777-777777777777"), Code: "standard", Name: "标准版",
		Status: entitlement.StatusActive, AccountQuota: 3, TaskQuota: 10, DailySendQuota: 20,
		Features: map[string]bool{"browser_text_send": true}, CreatedAt: now, UpdatedAt: now,
	})
	if plan.ID == "" || plan.Features["browser_text_send"] != true || plan.CreatedAt != "2026-08-24T09:00:00Z" {
		t.Fatalf("plan view = %+v", plan)
	}

	fingerprint := "ABC123"
	redemption := adminRedemptionViewFrom(entitlement.RedemptionSummary{
		GrantPublicID: uuid.MustParse("88888888-8888-8888-8888-888888888888"),
		UserPublicID:  uuid.MustParse("99999999-9999-9999-9999-999999999999"), UserDisplayName: "demo",
		PlanCode: "standard", PlanName: "标准版", SourceType: entitlement.SourceCard,
		StartsAt: now, ExpiresAt: now.Add(24 * time.Hour), CodeFingerprint: &fingerprint, CreatedAt: now,
	})
	if redemption.CodeFingerprint == nil || *redemption.CodeFingerprint != fingerprint || redemption.ID == "" {
		t.Fatalf("redemption view = %+v", redemption)
	}
}

func TestParseOptionalAdminTime(t *testing.T) {
	if value, err := parseOptionalAdminTime(nil); err != nil || value != nil {
		t.Fatalf("nil time = %v, %v", value, err)
	}
	value := "2026-08-24T09:00:00Z"
	parsed, err := parseOptionalAdminTime(&value)
	if err != nil || parsed == nil || parsed.Format(time.RFC3339) != value {
		t.Fatalf("parsed time = %v, %v", parsed, err)
	}
}
