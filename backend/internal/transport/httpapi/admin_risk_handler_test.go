package httpapi

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestAdminRiskFilterDecodesCursorAndPreservesFilters(t *testing.T) {
	createdAt := time.Date(2026, 8, 24, 12, 0, 0, 123456789, time.UTC)
	filter, err := adminRiskFilter(httptest.NewRequest("GET", "/?category=auth&severity=CRITICAL&code=expired&limit=20&cursor="+encodeAdminRiskCursor(createdAt, 42), nil))
	if err != nil {
		t.Fatal(err)
	}
	if filter.Category != "AUTH" || filter.Severity != "critical" || filter.Code != "expired" || filter.Limit != 20 || filter.AfterID != 42 || filter.AfterCreatedAt == nil || !filter.AfterCreatedAt.Equal(createdAt) {
		t.Fatalf("filter = %+v", filter)
	}
}

func TestAdminRiskFilterRejectsInvalidCursor(t *testing.T) {
	for _, query := range []string{"cursor=!?", "cursor=" + encodeAdminRiskCursor(time.Now(), 0), "limit=101"} {
		if _, err := adminRiskFilter(httptest.NewRequest("GET", "/?"+query, nil)); err == nil {
			t.Fatalf("query %q should be rejected", query)
		}
	}
}
