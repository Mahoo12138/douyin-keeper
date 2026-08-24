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
		PublicID: uuid.MustParse("11111111-1111-1111-1111-111111111111"),
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
