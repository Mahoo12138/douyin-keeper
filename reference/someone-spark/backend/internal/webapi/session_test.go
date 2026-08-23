package webapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"huohua/internal/config"
	"huohua/internal/sidecar"
)

func cookieHeader(rec *httptest.ResponseRecorder, name string) string {
	for _, h := range rec.Result().Header.Values("Set-Cookie") {
		if strings.HasPrefix(h, name+"=") {
			return h
		}
	}
	return ""
}

func TestCookieSecureForcedByEnv(t *testing.T) {
	gin.SetMode(gin.TestMode)
	s := &Server{cfg: &config.Config{CookieSecure: true}}
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	s.setCookies(c, "sess", "csrf", 60)
	got := cookieHeader(rec, cookieSession)
	if !strings.Contains(got, "Secure") {
		t.Fatalf("HUOHUA_COOKIE_SECURE=true must set Secure: %s", got)
	}
	if !strings.Contains(got, "HttpOnly") || !strings.Contains(got, "Path=/") {
		t.Fatalf("session cookie flags: %s", got)
	}
	if strings.Contains(got, "Domain=") {
		t.Fatalf("host-only cookie must omit Domain: %s", got)
	}
}

func TestCookieSecureFromForwardedProto(t *testing.T) {
	gin.SetMode(gin.TestMode)
	s := &Server{cfg: &config.Config{CookieSecure: false}}
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Request.Header.Set("X-Forwarded-Proto", "https")
	s.setCookies(c, "sess", "csrf", 60)
	got := cookieHeader(rec, cookieSession)
	if !strings.Contains(got, "Secure") {
		t.Fatalf("X-Forwarded-Proto=https must set Secure: %s", got)
	}
}

func TestCookieDomainIgnoresLoopback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	s := &Server{cfg: &config.Config{CookieDomain: "douyin.ovim.cn"}}
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	s.setCookies(c, "sess", "csrf", 60)
	if strings.Contains(cookieHeader(rec, cookieSession), "Domain=") {
		t.Fatal("cookie must be host-only even if HUOHUA_COOKIE_DOMAIN is set")
	}
	if strings.Contains(cookieHeader(rec, cookieCSRF), "Domain=") {
		t.Fatal("csrf cookie must be host-only")
	}
}

func TestIssueCSRFSetsHostOnlyCookie(t *testing.T) {
	gin.SetMode(gin.TestMode)
	s := &Server{cfg: &config.Config{CookieSecure: false, CookieDomain: "should.not.appear"}}
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/csrf", nil)
	c.Request.Header.Set("X-Forwarded-Proto", "https")
	s.issueCSRF(c)
	got := cookieHeader(rec, cookieCSRF)
	if got == "" {
		t.Fatal("GET /csrf must Set-Cookie huohua_csrf")
	}
	if !strings.Contains(got, "Path=/") || !strings.Contains(got, "Secure") || !strings.Contains(got, "SameSite=Lax") {
		t.Fatalf("csrf cookie flags: %s", got)
	}
	if strings.Contains(got, "Domain=") || strings.Contains(got, "HttpOnly") {
		t.Fatalf("csrf must be host-only and JS-readable: %s", got)
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("csrf must not be cached: %s", rec.Header().Get("Cache-Control"))
	}
}

func TestRequireCSRFDoubleSubmit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	s := &Server{cfg: &config.Config{}}
	r := gin.New()
	r.POST("/t", s.requireCSRF(), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	post := func(cookie, header string) int {
		req := httptest.NewRequest(http.MethodPost, "/t", nil)
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		if header != "" {
			req.Header.Set("X-CSRF-Token", header)
		}
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec.Code
	}
	if code := post("", ""); code != http.StatusForbidden {
		t.Fatalf("missing token: %d", code)
	}
	if code := post("huohua_csrf=abc", ""); code != http.StatusForbidden {
		t.Fatalf("missing header: %d", code)
	}
	if code := post("huohua_csrf=abc", "xyz"); code != http.StatusForbidden {
		t.Fatalf("mismatch: %d", code)
	}
	if code := post("huohua_csrf=tok", "tok"); code != http.StatusNoContent {
		t.Fatalf("match: %d", code)
	}
	if code := post("huohua_csrf=old; huohua_csrf=new", "new"); code != http.StatusNoContent {
		t.Fatalf("duplicate cookies should match header: %d", code)
	}
}

func TestSidecarQRErrorMessages(t *testing.T) {
	if _, _, blocked := sidecarQRError(sidecar.Status{State: sidecar.StateReady}); blocked {
		t.Fatal("ready should not block")
	}
	code, msg, blocked := sidecarQRError(sidecar.Status{State: sidecar.StateInstalling})
	if !blocked || code != "browser_installing" || msg != "正在安装浏览器，请稍后重试" {
		t.Fatalf("installing: %s %s", code, msg)
	}
	code, msg, blocked = sidecarQRError(sidecar.Status{})
	if !blocked || !strings.Contains(msg, "Worker") {
		t.Fatalf("missing worker: %s %s", code, msg)
	}
	code, msg, blocked = sidecarQRError(sidecar.Status{State: sidecar.StateError, Message: "装浏览器失败"})
	if !blocked || code != "sidecar" || msg != "装浏览器失败" {
		t.Fatalf("error: %s %s", code, msg)
	}
}
