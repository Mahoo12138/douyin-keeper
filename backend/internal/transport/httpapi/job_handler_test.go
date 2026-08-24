package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSMSVerificationCodePattern(t *testing.T) {
	for _, value := range []string{"1234", "12345678"} {
		if !smsVerificationCodePattern.MatchString(value) {
			t.Errorf("code %q should be accepted", value)
		}
	}
	for _, value := range []string{"123", "123456789", "12a456", ""} {
		if smsVerificationCodePattern.MatchString(value) {
			t.Errorf("code %q should be rejected", value)
		}
	}
}

func TestLastEventIDRejectsInvalidAndNegativeValues(t *testing.T) {
	valid := httptest.NewRequest("GET", "/jobs/1/events", nil)
	valid.Header.Set("Last-Event-ID", "12")
	if got := lastEventID(valid); got != 12 {
		t.Fatalf("lastEventID(valid) = %d, want 12", got)
	}
	for _, value := range []string{"", "not-a-number", "-1"} {
		req := httptest.NewRequest("GET", "/jobs/1/events", nil)
		req.Header.Set("Last-Event-ID", value)
		if got := lastEventID(req); got != 0 {
			t.Fatalf("lastEventID(%q) = %d, want 0", value, got)
		}
	}
}

func TestWriteSSEEventUsesDocumentedEventIdAndDataFields(t *testing.T) {
	var output strings.Builder
	writeSSEEvent(&output, "qr_ready", 3, []byte(`{"format":"data_url"}`))
	if got, want := output.String(), "event: qr_ready\nid: 3\ndata: {\"format\":\"data_url\"}\n\n"; got != want {
		t.Fatalf("SSE frame = %q, want %q", got, want)
	}
}
