package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func newAuthSvc() *auth.Service {
	tx := postgres.NewTxManager(pool)
	return auth.NewService(
		postgres.NewAuthUserRepo(pool), postgres.NewAuthSessionRepo(pool), tx,
		auth.NewHasher(), []byte(testSigningKey), []byte(testPepper),
		15*time.Minute, 30*24*time.Hour, nil)
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
	// except=0: keep nothing; revoke every session of the user.
	if err := svc.LogoutAll(ctx, res.User.ID, 0); err != nil {
		t.Fatalf("logout-all: %v", err)
	}
	// Any refresh of the surviving session must fail (session revoked).
	if _, err := svc.Refresh(ctx, sess.RefreshToken, auth.ClientWeb); err == nil {
		t.Fatalf("expected refresh to fail after logout-all")
	}
}