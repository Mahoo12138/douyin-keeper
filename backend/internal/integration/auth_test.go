package integration

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func newAuthSvc() *auth.Service {
	return newAuthSvcWithWechat(nil)
}

type testWechatExchanger struct{ subject string }

func (e testWechatExchanger) ExchangeForSubject(context.Context, string) (string, error) {
	return e.subject, nil
}

func newAuthSvcWithWechat(wechat auth.WechatExchanger) *auth.Service {
	tx := postgres.NewTxManager(pool)
	return auth.NewService(
		postgres.NewAuthUserRepo(pool), postgres.NewAuthSessionRepo(pool), tx,
		auth.NewHasher(), []byte(testSigningKey), []byte(testPepper),
		15*time.Minute, 30*24*time.Hour, wechat)
}

func TestWechatLinkAndLoginConsumeLinkCode(t *testing.T) {
	ctx := context.Background()
	subject := "openid-" + uuid.NewString()
	svc := newAuthSvcWithWechat(testWechatExchanger{subject: subject})
	registered, err := svc.Register(ctx, "wechat_"+uuid.NewString()[:8], "password123")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	_, code, err := svc.CreateLinkCode(ctx, registered.User.ID)
	if err != nil {
		t.Fatalf("create link code: %v", err)
	}
	// Accept the same code in the case and separator form a mini client may
	// provide after copying it from the PC screen.
	linkResult, err := svc.LinkWechatMini(ctx, registered.User.ID, "wx-code", strings.ToLower(strings.ReplaceAll(code, "-", "")))
	if err != nil {
		t.Fatalf("link wechat mini: %v", err)
	}
	if linkResult.User.PublicID != registered.User.PublicID || linkResult.RefreshToken == "" {
		t.Fatalf("unexpected link session: %+v", linkResult)
	}
	loginResult, err := svc.LoginWechatMini(ctx, "wx-code")
	if err != nil {
		t.Fatalf("wechat mini login: %v", err)
	}
	if loginResult.User.PublicID != registered.User.PublicID || loginResult.RefreshToken == "" {
		t.Fatalf("unexpected login session: %+v", loginResult)
	}
	if _, err := svc.LinkWechatMini(ctx, registered.User.ID, "wx-code", code); err == nil {
		t.Fatal("expected consumed link code to be rejected")
	}

	second, err := svc.Register(ctx, "wechat_other_"+uuid.NewString()[:8], "password123")
	if err != nil {
		t.Fatalf("register second user: %v", err)
	}
	_, secondCode, err := svc.CreateLinkCode(ctx, second.User.ID)
	if err != nil {
		t.Fatalf("create second link code: %v", err)
	}
	if _, err := svc.LinkWechatMini(ctx, second.User.ID, "wx-code", secondCode); err == nil {
		t.Fatal("expected one wechat identity to reject a second user")
	}
	active, err := postgres.NewAuthSessionRepo(pool).CountActiveLinkCodes(ctx, second.User.ID, time.Now())
	if err != nil || active != 1 {
		t.Fatalf("failed identity bind should preserve link code, active=%d err=%v", active, err)
	}
	for i := 0; i < auth.MaxActiveLinkCodes-1; i++ {
		if _, _, err := svc.CreateLinkCode(ctx, second.User.ID); err != nil {
			t.Fatalf("create active link code #%d: %v", i+2, err)
		}
	}
	if _, _, err := svc.CreateLinkCode(ctx, second.User.ID); err == nil {
		t.Fatal("expected fourth active link code to be rejected")
	}
}

func TestAuthRegisterLoginMe(t *testing.T) {
	ctx := context.Background()
	svc := newAuthSvc()
	username := "tester_" + uuid.NewString()[:8]

	res, err := svc.Register(ctx, username, "password123")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if res.AccessToken == "" || res.RefreshToken == "" {
		t.Fatalf("expected tokens, got %+v", res)
	}
	if _, err := uuid.Parse(res.User.PublicID.String()); err != nil {
		t.Fatalf("bad public id: %v", err)
	}

	// /me path via token.
	claims, err := auth.ParseAccess([]byte(testSigningKey), res.AccessToken)
	if err != nil {
		t.Fatalf("parse access: %v", err)
	}
	if claims.Subject != res.User.PublicID.String() {
		t.Fatalf("token sub mismatch: %s != %s", claims.Subject, res.User.PublicID)
	}

	// login
	lres, err := svc.Login(ctx, username, "password123", auth.ClientWeb)
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if lres.User.PublicID != res.User.PublicID {
		t.Fatalf("login returned different user")
	}

	// wrong password → INVALID_CREDENTIALS
	if _, err := svc.Login(ctx, username, "wrongpass", auth.ClientWeb); err == nil {
		t.Fatalf("expected invalid credentials error")
	}
}

func TestRefreshRotationAndReuseDetection(t *testing.T) {
	ctx := context.Background()
	svc := newAuthSvc()
	res, err := svc.Register(ctx, "rotator_"+uuid.NewString()[:8], "password123")
	if err != nil {
		t.Fatalf("register: %v", err)
	}

	// First rotation works.
	r1, err := svc.Refresh(ctx, res.RefreshToken, auth.ClientWeb)
	if err != nil {
		t.Fatalf("refresh #1: %v", err)
	}
	// Old token is now used → second use of the same token must revoke session.
	if _, err := svc.Refresh(ctx, res.RefreshToken, auth.ClientWeb); err == nil {
		t.Fatalf("expected reuse detection to fail")
	}
	// The newly-issued token still works.
	r2, err := svc.Refresh(ctx, r1.RefreshToken, auth.ClientWeb)
	if err != nil {
		t.Fatalf("refresh #2 (new token): %v", err)
	}
	if r2.RefreshToken == "" {
		t.Fatalf("expected rotated refresh token")
	}

	// After reuse detection the original session is revoked: r1 must now fail.
	if _, err := svc.Refresh(ctx, r1.RefreshToken, auth.ClientWeb); err == nil {
		t.Fatalf("expected session revocation after reuse detection")
	}
}

func TestLogoutAllRevokesSessions(t *testing.T) {
	ctx := context.Background()
	svc := newAuthSvc()
	username := "logoutall_" + uuid.NewString()[:8]
	res, err := svc.Register(ctx, username, "password123")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	sess, _ := svc.Login(ctx, username, "password123", auth.ClientWeb)
	// Logout-all revokes every session, including the session that initiated it.
	if err := svc.LogoutAll(ctx, res.User.ID); err != nil {
		t.Fatalf("logout-all: %v", err)
	}
	// Refresh of either session must fail (both sessions are revoked).
	if _, err := svc.Refresh(ctx, sess.RefreshToken, auth.ClientWeb); err == nil {
		t.Fatalf("expected second session refresh to fail after logout-all")
	}
	if _, err := svc.Refresh(ctx, res.RefreshToken, auth.ClientWeb); err == nil {
		t.Fatalf("expected current session refresh to fail after logout-all")
	}
}
