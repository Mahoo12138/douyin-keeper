package httpapi

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestAdminAccountFilterDecodesCursor(t *testing.T) {
	createdAt := time.Date(2026, 8, 24, 12, 0, 0, 123456789, time.UTC)
	filter, err := adminAccountFilter(httptest.NewRequest("GET", "/?limit=20&cursor="+encodeAdminAccountCursor(createdAt, 42), nil))
	if err != nil {
		t.Fatal(err)
	}
	if filter.Limit != 20 || filter.AfterID != 42 || filter.AfterCreatedAt == nil || !filter.AfterCreatedAt.Equal(createdAt) {
		t.Fatalf("filter = %+v", filter)
	}
}

func TestAdminAccountFilterRejectsInvalidCursor(t *testing.T) {
	for _, query := range []string{"cursor=!?", "cursor=" + encodeAdminAccountCursor(time.Now(), 0), "limit=101"} {
		if _, err := adminAccountFilter(httptest.NewRequest("GET", "/?"+query, nil)); err == nil {
			t.Fatalf("query %q should be rejected", query)
		}
	}
}
