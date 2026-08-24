package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
)

func TestAuthResponseKeepsRefreshTokenOnlyForMiniClients(t *testing.T) {
	user := &auth.User{PublicID: uuid.New(), DisplayName: "tester", Role: auth.RoleUser}
	session := auth.SessionResult{AccessToken: "access", RefreshToken: "refresh", ExpiresIn: 900, User: user}

	web := authResponse(session, false)
	if web.RefreshToken != nil {
		t.Fatalf("web response exposed refresh token %q", *web.RefreshToken)
	}
	webJSON, err := json.Marshal(web)
	if err != nil || strings.Contains(string(webJSON), "refresh_token") {
		t.Fatalf("web JSON leaked refresh token: %s", webJSON)
	}
	mini := authResponse(session, true)
	if mini.RefreshToken == nil || *mini.RefreshToken != "refresh" {
		t.Fatalf("mini response refresh token = %v, want refresh", mini.RefreshToken)
	}
}

func TestRefreshInputSeparatesWebCookieAndMiniBodyTokens(t *testing.T) {
	web := httptest.NewRequest(http.MethodPost, "http://app.example.test/api/v1/auth/refresh", strings.NewReader(`{"refresh_token":"body-token"}`))
	web.AddCookie(&http.Cookie{Name: RefreshCookieName, Value: "cookie-token"})
	token, client, err := refreshInput(web)
	if err != nil || token != "cookie-token" || client != auth.ClientWeb {
		t.Fatalf("web refresh input = token %q client %q err %v", token, client, err)
	}

	mini := httptest.NewRequest(http.MethodPost, "http://app.example.test/api/v1/auth/refresh", strings.NewReader(`{"refresh_token":"mini-token"}`))
	token, client, err = refreshInput(mini)
	if err != nil || token != "mini-token" || client != auth.ClientMini {
		t.Fatalf("mini refresh input = token %q client %q err %v", token, client, err)
	}
}

func TestRefreshCookieSecureFollowsRequestScheme(t *testing.T) {
	server := &Server{refreshTTL: time.Hour}

	tests := []struct {
		name          string
		request       *http.Request
		wantSecure    bool
		wantMaxAge    int
		setCookieFunc func(http.ResponseWriter, *http.Request)
	}{
		{
			name:       "local HTTP",
			request:    httptest.NewRequest(http.MethodPost, "http://app.example.test/api/v1/auth/login", nil),
			wantSecure: false,
			setCookieFunc: func(w http.ResponseWriter, r *http.Request) {
				server.setRefreshCookie(w, r, auth.SessionResult{RefreshToken: "refresh"})
			},
		},
		{
			name:       "direct HTTPS",
			request:    httptest.NewRequest(http.MethodPost, "https://app.example.test/api/v1/auth/login", nil),
			wantSecure: true,
			setCookieFunc: func(w http.ResponseWriter, r *http.Request) {
				server.setRefreshCookie(w, r, auth.SessionResult{RefreshToken: "refresh"})
			},
		},
		{
			name: "forwarded HTTPS",
			request: func() *http.Request {
				r := httptest.NewRequest(http.MethodPost, "http://app.example.test/api/v1/auth/login", nil)
				r.RemoteAddr = "10.0.0.2:8080"
				r.Header.Set("X-Forwarded-Proto", "https")
				return requestThroughTrustedProxy(t, r)
			}(),
			wantSecure: true,
			setCookieFunc: func(w http.ResponseWriter, r *http.Request) {
				server.setRefreshCookie(w, r, auth.SessionResult{RefreshToken: "refresh"})
			},
		},
		{
			name:       "clear on HTTPS",
			request:    httptest.NewRequest(http.MethodPost, "https://app.example.test/api/v1/auth/logout", nil),
			wantSecure: true,
			wantMaxAge: -1,
			setCookieFunc: func(w http.ResponseWriter, r *http.Request) {
				server.clearRefreshCookie(w, r)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			tt.setCookieFunc(recorder, tt.request)
			cookies := recorder.Result().Cookies()
			if len(cookies) != 1 {
				t.Fatalf("Set-Cookie count = %d, want 1", len(cookies))
			}
			cookie := cookies[0]
			if cookie.Secure != tt.wantSecure {
				t.Fatalf("Secure = %v, want %v", cookie.Secure, tt.wantSecure)
			}
			if !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" {
				t.Fatalf("cookie security attributes = HttpOnly:%v SameSite:%v Path:%q", cookie.HttpOnly, cookie.SameSite, cookie.Path)
			}
			if tt.wantMaxAge != 0 && cookie.MaxAge != tt.wantMaxAge {
				t.Fatalf("MaxAge = %d, want %d", cookie.MaxAge, tt.wantMaxAge)
			}
		})
	}
}
