package httpapi

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
)

func TestAdminUserViewIncludesCountsAndOptionalDates(t *testing.T) {
	createdAt := time.Date(2026, 8, 24, 9, 0, 0, 0, time.UTC)
	lastLogin := createdAt.Add(time.Hour)
	expiresAt := createdAt.Add(30 * 24 * time.Hour)
	view := adminUserViewFrom(admin.UserSummary{
		PublicID:    uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		DisplayName: "demo", Role: "user", Status: "active", CreatedAt: createdAt,
		LastLoginAt: &lastLogin, AccountCount: 2, TaskCount: 4, EntitlementExpiresAt: &expiresAt,
	})

	if view.ID != "11111111-1111-1111-1111-111111111111" || view.AccountCount != 2 || view.TaskCount != 4 {
		t.Fatalf("admin user view = %+v", view)
	}
	if view.LastLoginAt == nil || view.EntitlementExpiresAt == nil {
		t.Fatal("optional dates were dropped")
	}
	if *view.LastLoginAt != "2026-08-24T10:00:00Z" || *view.EntitlementExpiresAt != "2026-09-23T09:00:00Z" {
		t.Fatalf("formatted dates = login %q, expiry %q", *view.LastLoginAt, *view.EntitlementExpiresAt)
	}
}

func TestAdminAccountViewIncludesOperationalSummary(t *testing.T) {
	checkedAt := time.Date(2026, 8, 24, 9, 0, 0, 0, time.UTC)
	adapter := "browser.consumer"
	account := admin.AccountSummary{
		PublicID:      uuid.MustParse("22222222-2222-2222-2222-222222222222"),
		OwnerPublicID: uuid.MustParse("33333333-3333-3333-3333-333333333333"), OwnerDisplayName: "demo",
		Nickname: "火花账号", BindingStatus: "bound", SessionStatus: "valid", RiskStatus: "normal",
		Capabilities:       []admin.AccountCapability{{Name: "friends.sync", Status: "available", Adapter: &adapter, CheckedAt: checkedAt}},
		TodaySendSucceeded: 3, TodaySendFailed: 1,
		LatestError: &admin.RecentError{Category: "PLATFORM", Code: "RATE_LIMITED", Severity: "warning", CreatedAt: checkedAt},
	}

	view := adminAccountViewFrom(account)
	if view.ID != "22222222-2222-2222-2222-222222222222" || view.OwnerDisplayName != "demo" || view.TodaySendSucceeded != 3 || view.TodaySendFailed != 1 {
		t.Fatalf("admin account view = %+v", view)
	}
	if len(view.Capabilities) != 1 || view.Capabilities[0].CheckedAt != "2026-08-24T09:00:00Z" {
		t.Fatalf("capabilities = %+v", view.Capabilities)
	}
	if view.LatestError == nil || view.LatestError.Code != "RATE_LIMITED" {
		t.Fatalf("latest error = %+v", view.LatestError)
	}
}
