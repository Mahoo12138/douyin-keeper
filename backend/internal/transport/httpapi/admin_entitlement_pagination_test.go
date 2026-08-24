package httpapi

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestAdminBatchFilterDecodesCursor(t *testing.T) {
	createdAt := time.Date(2026, 8, 24, 12, 0, 0, 123456789, time.UTC)
	filter, err := adminBatchFilter(httptest.NewRequest("GET", "/?limit=20&cursor="+encodeAdminBatchCursor(createdAt, 42), nil))
	if err != nil {
		t.Fatal(err)
	}
	if filter.Limit != 20 || filter.AfterID != 42 || filter.AfterCreatedAt == nil || !filter.AfterCreatedAt.Equal(createdAt) {
		t.Fatalf("filter = %+v", filter)
	}
}

func TestAdminRedemptionFilterRejectsInvalidCursor(t *testing.T) {
	for _, query := range []string{"cursor=!?", "cursor=" + encodeAdminRedemptionCursor(time.Now(), 0), "limit=101"} {
		if _, err := adminRedemptionFilter(httptest.NewRequest("GET", "/?"+query, nil)); err == nil {
			t.Fatalf("query %q should be rejected", query)
		}
	}
}

func TestAdminCardCodeFilterDecodesCursor(t *testing.T) {
	filter, err := adminCardCodeFilter(httptest.NewRequest("GET", "/?limit=20&cursor="+encodeAdminCardCodeCursor(42), nil))
	if err != nil {
		t.Fatal(err)
	}
	if filter.Limit != 20 || filter.AfterID != 42 {
		t.Fatalf("filter = %+v", filter)
	}
}

func TestAdminPlanFilterDecodesCursor(t *testing.T) {
	filter, err := adminPlanFilter(httptest.NewRequest("GET", "/?limit=20&cursor="+encodeAdminPlanCursor(42), nil))
	if err != nil {
		t.Fatal(err)
	}
	if filter.Limit != 20 || filter.AfterID != 42 {
		t.Fatalf("filter = %+v", filter)
	}
}
