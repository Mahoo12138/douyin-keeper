package httpapi

import (
	"net/http/httptest"
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

func TestAdminRuntimeViewIncludesPoolsQueuesAndHealth(t *testing.T) {
	observedAt := time.Date(2026, 8, 24, 9, 0, 0, 0, time.UTC)
	view := adminRuntimeViewFrom(admin.RuntimeSummary{
		ObservedAt: observedAt, RunningJobs: 2, FailedJobs24h: 4,
		BrowserSlotsUsed: 1, BrowserSlotsLimit: 3, SchedulerOnline: true,
		Pools:  []admin.WorkerPoolSummary{{Name: "browser", Online: true, ActiveWorkers: 1, Concurrency: 3}},
		Queues: []admin.QueueSummary{{Name: "browser", Pool: "browser", Pending: 5, Active: 1, Retry: 2, LatencySeconds: 7}},
	})

	if view.ObservedAt != "2026-08-24T09:00:00Z" || view.RunningJobs != 2 || view.FailedJobs24h != 4 || !view.SchedulerOnline {
		t.Fatalf("runtime view = %+v", view)
	}
	if len(view.Pools) != 1 || view.Pools[0].ActiveWorkers != 1 || len(view.Queues) != 1 || view.Queues[0].Pending != 5 {
		t.Fatalf("runtime pools/queues = %+v / %+v", view.Pools, view.Queues)
	}
}

func TestAdminAdapterViewIncludesHealthAndControlState(t *testing.T) {
	checkedAt := time.Date(2026, 8, 24, 9, 0, 0, 0, time.UTC)
	errorCode := "ADAPTER_INCOMPATIBLE"
	view := adminAdapterViewFrom(admin.AdapterHealthSummary{
		Name: "browser.consumer", Status: "down", Enabled: true, Executable: true,
		ErrorCode: &errorCode, FailureCount: 3, CheckedAt: &checkedAt,
	})
	if view.Name != "browser.consumer" || view.Status != "down" || !view.Enabled || !view.Executable || view.FailureCount != 3 {
		t.Fatalf("adapter view = %+v", view)
	}
	if view.ErrorCode == nil || *view.ErrorCode != errorCode || view.CheckedAt == nil || *view.CheckedAt != "2026-08-24T09:00:00Z" {
		t.Fatalf("adapter health details = %+v", view)
	}
}

func TestAdminRiskViewOmitsSensitiveDetailAndFormatsDates(t *testing.T) {
	createdAt := time.Date(2026, 8, 24, 9, 0, 0, 0, time.UTC)
	cooldownUntil := createdAt.Add(10 * time.Minute)
	adapter := "browser.consumer"
	action := "cooldown"
	view := adminRiskViewFrom(admin.RiskSummary{
		PublicID:         uuid.MustParse("44444444-4444-4444-4444-444444444444"),
		AccountPublicID:  uuid.MustParse("55555555-5555-5555-5555-555555555555"),
		OwnerDisplayName: "demo", Nickname: "火花账号", Category: "PLATFORM",
		Code: "PLATFORM_RATE_LIMITED", Severity: "warning", SourceAdapter: &adapter,
		Action: &action, CooldownUntil: &cooldownUntil, CreatedAt: createdAt,
	})
	if view.ID != "44444444-4444-4444-4444-444444444444" || view.AccountID != "55555555-5555-5555-5555-555555555555" || view.Code != "PLATFORM_RATE_LIMITED" {
		t.Fatalf("risk view = %+v", view)
	}
	if view.CreatedAt != "2026-08-24T09:00:00Z" || view.CooldownUntil == nil || *view.CooldownUntil != "2026-08-24T09:10:00Z" {
		t.Fatalf("risk dates = %+v", view)
	}
}

func TestAdminRiskFilterValidatesAndNormalizes(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/v1/admin/risks?category=auth&severity=CRITICAL&code=expired&limit=20", nil)
	filter, err := adminRiskFilter(req)
	if err != nil || filter.Category != "AUTH" || filter.Severity != "critical" || filter.Code != "expired" || filter.Limit != 20 {
		t.Fatalf("filter = %+v, err = %v", filter, err)
	}
	invalid := httptest.NewRequest("GET", "/api/v1/admin/risks?category=INVALID", nil)
	if _, err := adminRiskFilter(invalid); err == nil {
		t.Fatal("invalid category should be rejected")
	}
}
