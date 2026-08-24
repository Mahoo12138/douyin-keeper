package wechat

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
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

func TestClientSendSubscriptionCachesAccessTokenAndBuildsTemplatePayload(t *testing.T) {
	var tokenCalls atomic.Int32
	var sendCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			tokenCalls.Add(1)
			if r.URL.Query().Get("grant_type") != "client_credential" || r.URL.Query().Get("appid") != "app-id" {
				t.Fatalf("unexpected token query: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"access_token":"cached-token","expires_in":7200}`))
		case "/send":
			sendCalls.Add(1)
			if r.URL.Query().Get("access_token") != "cached-token" {
				t.Fatalf("unexpected access token: %s", r.URL.Query().Get("access_token"))
			}
			var payload SubscriptionMessage
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			if payload.ToUser != "openid-1" || payload.TemplateID != "template-1" || payload.Data["thing1"].Value != "标题" {
				t.Fatalf("unexpected subscription payload: %+v", payload)
			}
			_, _ = w.Write([]byte(`{"errcode":0}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewClient("app-id", "app-secret", server.Client())
	client.TokenURL = server.URL + "/token"
	client.SendURL = server.URL + "/send"
	message := SubscriptionMessage{ToUser: "openid-1", TemplateID: "template-1", Data: map[string]SubscriptionValue{"thing1": {Value: "标题"}}}
	if err := client.SendSubscription(context.Background(), message); err != nil {
		t.Fatal(err)
	}
	if err := client.SendSubscription(context.Background(), message); err != nil {
		t.Fatal(err)
	}
	if tokenCalls.Load() != 1 || sendCalls.Load() != 2 {
		t.Fatalf("token calls=%d send calls=%d", tokenCalls.Load(), sendCalls.Load())
	}
}
