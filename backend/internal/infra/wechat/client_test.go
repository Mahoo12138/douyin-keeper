package wechat

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestClientExchangeForSubjectUsesCode2SessionAndDoesNotExposeSessionKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("appid") != "app-id" || r.URL.Query().Get("secret") != "app-secret" ||
			r.URL.Query().Get("js_code") != "wx-code" || r.URL.Query().Get("grant_type") != "authorization_code" {
			t.Fatalf("unexpected query: %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"openid":"openid-123","session_key":"secret-session-key","unionid":"union-1"}`))
	}))
	defer server.Close()

	client := NewClient("app-id", "app-secret", server.Client())
	client.EndpointURL = server.URL
	subject, err := client.ExchangeForSubject(context.Background(), " wx-code ")
	if err != nil || subject != "openid-123" {
		t.Fatalf("subject=%q err=%v", subject, err)
	}
	if strings.Contains(subject, "session") {
		t.Fatal("session key leaked through subject")
	}
}

func TestClientExchangeForSubjectMapsTransportFailureToRetryableExternalError(t *testing.T) {
	client := NewClient("app-id", "app-secret", &http.Client{})
	client.EndpointURL = "http://127.0.0.1:1/unreachable"
	_, err := client.ExchangeForSubject(context.Background(), "wx-code")
	if err == nil || !strings.Contains(err.Error(), "WECHAT_IDENTITY_NOT_LINKED") {
		t.Fatalf("expected typed wechat error, got %v", err)
	}
}
