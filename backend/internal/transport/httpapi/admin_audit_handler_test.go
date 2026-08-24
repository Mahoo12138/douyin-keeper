package httpapi

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestAdminAuditFilterDecodesCursorAndPreservesFilters(t *testing.T) {
	createdAt := time.Date(2026, 8, 24, 12, 0, 0, 123456789, time.UTC)
	filter, err := adminAuditFilter(httptest.NewRequest("GET", "/?action=adapter.disable&resource_type=adapter&resource_id=resource-1&actor=admin&limit=20&cursor="+encodeAdminAuditCursor(createdAt, 42), nil))
	if err != nil {
		t.Fatal(err)
	}
	if filter.Action != "adapter.disable" || filter.ResourceType != "adapter" || filter.ResourceID != "resource-1" || filter.Actor != "admin" || filter.Limit != 20 || filter.AfterID != 42 || filter.AfterCreatedAt == nil || !filter.AfterCreatedAt.Equal(createdAt) {
		t.Fatalf("filter = %+v", filter)
	}
}

func TestAdminAuditFilterRejectsInvalidCursor(t *testing.T) {
	for _, query := range []string{"cursor=!?", "cursor=" + encodeAdminAuditCursor(time.Now(), 0), "limit=101"} {
		if _, err := adminAuditFilter(httptest.NewRequest("GET", "/?"+query, nil)); err == nil {
			t.Fatalf("query %q should be rejected", query)
		}
	}
}
