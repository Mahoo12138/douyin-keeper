package httpapi

import (
	"net/http/httptest"
	"testing"
)

func TestSMSPhonePattern(t *testing.T) {
	for _, value := range []string{"13800138000", "+86 13800138000", "+1 (415) 555-0100"} {
		if !smsPhonePattern.MatchString(value) {
			t.Errorf("phone %q should be accepted", value)
		}
	}
	for _, value := range []string{"", "123", "phone-number", "+"} {
		if smsPhonePattern.MatchString(value) {
			t.Errorf("phone %q should be rejected", value)
		}
	}
}

func TestAccountSummaryFilterDecodesCursorAndLimit(t *testing.T) {
	filter, err := accountSummaryFilter(httptest.NewRequest("GET", "/?limit=20&cursor="+encodeAccountCursor(42), nil))
	if err != nil {
		t.Fatal(err)
	}
	if filter.Limit != 20 || filter.AfterID != 42 {
		t.Fatalf("filter = %+v", filter)
	}
}

func TestAccountSummaryFilterRejectsInvalidPagination(t *testing.T) {
	for _, query := range []string{"limit=101", "limit=bad", "cursor=!", "cursor=" + encodeAccountCursor(0)} {
		if _, err := accountSummaryFilter(httptest.NewRequest("GET", "/?"+query, nil)); err == nil {
			t.Fatalf("query %q should be rejected", query)
		}
	}
}
