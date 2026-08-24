package httpapi

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
)

func requestThroughTrustedProxy(t *testing.T, r *http.Request) *http.Request {
	t.Helper()
	_, network, err := net.ParseCIDR("10.0.0.0/8")
	if err != nil {
		t.Fatal(err)
	}
	var forwarded *http.Request
	handler := TrustedProxyHeaders([]*net.IPNet{network})(http.HandlerFunc(func(_ http.ResponseWriter, got *http.Request) {
		forwarded = got
	}))
	handler.ServeHTTP(httptest.NewRecorder(), r)
	return forwarded
}

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
	forwarded.RemoteAddr = "10.0.0.2:8080"
	forwarded.Header.Set("X-Forwarded-For", " 198.51.100.7, 10.0.0.1")
	forwarded = requestThroughTrustedProxy(t, forwarded)
	if got := clientIP(forwarded); got != "198.51.100.7" {
		t.Fatalf("forwarded client IP = %q", got)
	}
	ipv6 := httptest.NewRequest(http.MethodGet, "/", nil)
	ipv6.RemoteAddr = "[2001:db8::1]:443"
	if got := clientIP(ipv6); got != "2001:db8::1" {
		t.Fatalf("IPv6 client IP = %q", got)
	}
}

func TestForwardedHeadersRequireTrustedProxyPeer(t *testing.T) {
	untrusted := httptest.NewRequest(http.MethodGet, "http://app.example.test/", nil)
	untrusted.RemoteAddr = "203.0.113.10:8080"
	untrusted.Header.Set("X-Forwarded-Proto", "https")
	untrusted.Header.Set("X-Forwarded-For", "198.51.100.7")
	untrusted = requestThroughTrustedProxy(t, untrusted)
	if got := requestScheme(untrusted); got != "http" {
		t.Fatalf("untrusted forwarded scheme = %q, want http", got)
	}
	if got := clientIP(untrusted); got != "203.0.113.10" {
		t.Fatalf("untrusted forwarded client IP = %q, want peer IP", got)
	}

	trusted := httptest.NewRequest(http.MethodGet, "http://app.example.test/", nil)
	trusted.RemoteAddr = "10.0.0.2:8080"
	trusted.Header.Set("X-Forwarded-Proto", "https, http")
	trusted.Header.Set("X-Forwarded-For", "198.51.100.7, 10.0.0.2")
	trusted = requestThroughTrustedProxy(t, trusted)
	if got := requestScheme(trusted); got != "https" {
		t.Fatalf("trusted forwarded scheme = %q, want https", got)
	}
	if got := clientIP(trusted); got != "198.51.100.7" {
		t.Fatalf("trusted forwarded client IP = %q, want 198.51.100.7", got)
	}
}

func TestValidateRequestOriginAllowsSameOriginAndNonBrowserRequests(t *testing.T) {
	withoutOrigin := httptest.NewRequest(http.MethodPost, "http://app.example.test/api/v1/auth/refresh", nil)
	if err := validateRequestOrigin(withoutOrigin); err != nil {
		t.Fatalf("missing Origin should be allowed: %v", err)
	}

	sameOrigin := httptest.NewRequest(http.MethodPost, "http://app.example.test/api/v1/auth/refresh", nil)
	sameOrigin.Header.Set("Origin", "http://app.example.test")
	if err := validateRequestOrigin(sameOrigin); err != nil {
		t.Fatalf("same Origin should be allowed: %v", err)
	}

	defaultPort := httptest.NewRequest(http.MethodPost, "https://app.example.test/api/v1/auth/refresh", nil)
	defaultPort.Header.Set("Origin", "https://app.example.test")
	if err := validateRequestOrigin(defaultPort); err != nil {
		t.Fatalf("same HTTPS Origin should be allowed: %v", err)
	}

	forwardedTLS := httptest.NewRequest(http.MethodPost, "http://app.example.test/api/v1/auth/refresh", nil)
	forwardedTLS.RemoteAddr = "10.0.0.2:8080"
	forwardedTLS.Header.Set("X-Forwarded-Proto", "https")
	forwardedTLS.Header.Set("Origin", "https://app.example.test")
	forwardedTLS = requestThroughTrustedProxy(t, forwardedTLS)
	if err := validateRequestOrigin(forwardedTLS); err != nil {
		t.Fatalf("same forwarded HTTPS Origin should be allowed: %v", err)
	}
}

func TestValidateRequestOriginRejectsCrossSiteAndMalformedOrigins(t *testing.T) {
	tests := []string{
		"https://evil.example.test",
		"https://app.example.test/path",
		"null",
		"ftp://app.example.test",
	}
	for _, origin := range tests {
		r := httptest.NewRequest(http.MethodPost, "https://app.example.test/api/v1/auth/logout", nil)
		r.Header.Set("Origin", origin)
		if err := validateRequestOrigin(r); err == nil {
			t.Fatalf("Origin %q should be rejected", origin)
		}
	}

	wrongPort := httptest.NewRequest(http.MethodPost, "http://app.example.test:8080/api/v1/auth/logout", nil)
	wrongPort.Header.Set("Origin", "http://app.example.test:9090")
	if err := validateRequestOrigin(wrongPort); err == nil {
		t.Fatal("Origin with a different port should be rejected")
	}

	wrongScheme := httptest.NewRequest(http.MethodPost, "http://app.example.test/api/v1/auth/logout", nil)
	wrongScheme.Header.Set("Origin", "https://app.example.test")
	if err := validateRequestOrigin(wrongScheme); err == nil {
		t.Fatal("Origin with a different scheme should be rejected")
	}
}

func TestAuthMutationsRejectCrossOriginBeforeCallingServices(t *testing.T) {
	server := &Server{}
	handlers := []func(http.ResponseWriter, *http.Request){
		server.handleRefresh,
		server.handleLogout,
		server.handleLogoutAll,
	}
	for _, handler := range handlers {
		r := httptest.NewRequest(http.MethodPost, "https://app.example.test/api/v1/auth/mutation", nil)
		r.Header.Set("Origin", "https://evil.example.test")
		w := httptest.NewRecorder()
		handler(w, r)
		if w.Code != http.StatusForbidden {
			t.Fatalf("cross-origin auth mutation status = %d, want %d", w.Code, http.StatusForbidden)
		}
	}
}
