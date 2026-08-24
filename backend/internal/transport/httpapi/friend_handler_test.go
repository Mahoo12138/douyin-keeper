package httpapi

import (
	"net/http/httptest"
	"testing"
)

func TestFriendPaginationLimitAndCursor(t *testing.T) {
	request := httptest.NewRequest("GET", "/api/v1/accounts/id/friends?limit=25", nil)
	limit, err := friendLimit(request)
	if err != nil || limit != 25 {
		t.Fatalf("limit = %d, err=%v", limit, err)
	}

	cursor := encodeFriendCursor(42)
	request = httptest.NewRequest("GET", "/api/v1/accounts/id/friends?cursor="+cursor, nil)
	afterID, err := friendCursor(request)
	if err != nil || afterID != 42 {
		t.Fatalf("cursor = %d, err=%v", afterID, err)
	}
}

func TestFriendPaginationRejectsInvalidQuery(t *testing.T) {
	for _, query := range []string{"?limit=0", "?limit=101", "?limit=nope"} {
		r := httptest.NewRequest("GET", "/api/v1/accounts/id/friends"+query, nil)
		if _, err := friendLimit(r); err == nil {
			t.Fatalf("query %q should reject limit", query)
		}
	}
	r := httptest.NewRequest("GET", "/api/v1/accounts/id/friends?cursor=not-a-cursor", nil)
	if _, err := friendCursor(r); err == nil {
		t.Fatal("invalid cursor should be rejected")
	}
}
