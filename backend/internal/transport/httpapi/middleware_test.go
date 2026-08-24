package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
)

func TestLoggingWriterPreservesFlusher(t *testing.T) {
	writer := &loggingWriter{ResponseWriter: httptest.NewRecorder(), status: http.StatusOK}
	if _, ok := any(writer).(http.Flusher); !ok {
		t.Fatal("loggingWriter must preserve http.Flusher for SSE")
	}
	writer.Flush()
}

func TestMetricsUsesChiRoutePatternInsteadOfRawIDs(t *testing.T) {
	metrics := telemetry.NewMetrics()
	router := chi.NewRouter()
	router.Use(Metrics(metrics))
	router.Get("/jobs/{jobId}", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/jobs/abc-123", nil))
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d", recorder.Code)
	}
	rendered := metrics.Render()
	if !strings.Contains(rendered, `route="/jobs/{jobId}"`) {
		t.Fatalf("metrics should use route pattern:\n%s", rendered)
	}
	if strings.Contains(rendered, "abc-123") {
		t.Fatalf("raw job id leaked into metrics:\n%s", rendered)
	}
}

func TestRateLimiterRequiresAllDimensionsAndDoesNotPartiallyConsume(t *testing.T) {
	rl := newRateLimiter(1, time.Minute)
	if !rl.allowKeys("ip:one", "user:one") {
		t.Fatal("first request should be allowed")
	}
	if rl.allowKeys("ip:one", "user:two") {
		t.Fatal("same IP should be blocked")
	}
	if !rl.allowKeys("ip:two", "user:two") {
		t.Fatal("rejected request must not consume the new user's dimension")
	}
}

func TestRateLimitUserAndIPUsesAuthenticatedUserAndClientIP(t *testing.T) {
	handler := RateLimitUserAndIP(2, time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	principal := auth.Principal{UserID: 42}
	request := func(remoteAddr string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/redeem", nil)
		r.RemoteAddr = remoteAddr
		r = r.WithContext(auth.WithPrincipal(context.Background(), principal))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	if request("203.0.113.10:1000").Code != http.StatusNoContent || request("203.0.113.10:1001").Code != http.StatusNoContent {
		t.Fatal("first two user/IP requests should be allowed")
	}
	if request("203.0.113.10:1002").Code != http.StatusConflict {
		t.Fatal("same user/IP window should be rate limited")
	}
	if request("203.0.113.11:1003").Code != http.StatusConflict {
		t.Fatal("same user should be rate limited across IPs")
	}
}

func TestClientIPParsesForwardedAndIPv6Addresses(t *testing.T) {
	forwarded := httptest.NewRequest(http.MethodGet, "/", nil)
	forwarded.Header.Set("X-Forwarded-For", " 198.51.100.7, 10.0.0.1")
	if got := clientIP(forwarded); got != "198.51.100.7" {
		t.Fatalf("forwarded client IP = %q", got)
	}
	ipv6 := httptest.NewRequest(http.MethodGet, "/", nil)
	ipv6.RemoteAddr = "[2001:db8::1]:443"
	if got := clientIP(ipv6); got != "2001:db8::1" {
		t.Fatalf("IPv6 client IP = %q", got)
	}
}
