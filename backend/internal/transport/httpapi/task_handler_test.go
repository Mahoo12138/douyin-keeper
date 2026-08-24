package httpapi

import (
	"net/http/httptest"
	"testing"
)

func TestTaskLimitDefaultsAndRejectsInvalidValues(t *testing.T) {
	if got, err := taskLimit(httptest.NewRequest("GET", "/", nil)); err != nil || got != 50 {
		t.Fatalf("default limit = %d, err=%v", got, err)
	}
	if got, err := taskLimit(httptest.NewRequest("GET", "/?limit=25", nil)); err != nil || got != 25 {
		t.Fatalf("limit = %d, err=%v", got, err)
	}
	for _, value := range []string{"0", "101", "nope"} {
		if _, err := taskLimit(httptest.NewRequest("GET", "/?limit="+value, nil)); err == nil {
			t.Fatalf("limit %q should be rejected", value)
		}
	}
}

func TestTaskCursorRoundTripsInternalID(t *testing.T) {
	request := httptest.NewRequest("GET", "/?cursor="+encodeTaskCursor(42), nil)
	if got, err := taskCursor(request); err != nil || got != 42 {
		t.Fatalf("cursor = %d, err=%v", got, err)
	}
	for _, value := range []string{"!", "MA", "MA=="} {
		if _, err := taskCursor(httptest.NewRequest("GET", "/?cursor="+value, nil)); err == nil {
			t.Fatalf("cursor %q should be rejected", value)
		}
	}
}
