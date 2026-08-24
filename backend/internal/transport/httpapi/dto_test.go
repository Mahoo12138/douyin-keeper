package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
