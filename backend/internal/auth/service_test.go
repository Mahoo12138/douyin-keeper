package auth

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

type logoutAllSessionStub struct {
	userID int64
	reason string
	calls  int
}

func (s *logoutAllSessionStub) RevokeAllSessions(_ context.Context, userID int64, reason string) error {
	s.userID = userID
	s.reason = reason
	s.calls++
	return nil
}

func (*logoutAllSessionStub) CreateSession(context.Context, *AuthSession) error { return nil }
func (*logoutAllSessionStub) GetSessionByPublicID(context.Context, uuid.UUID) (*AuthSession, error) {
	return nil, nil
}
func (*logoutAllSessionStub) GetSessionByID(context.Context, int64) (*AuthSession, error) {
	return nil, nil
}
func (*logoutAllSessionStub) TouchSession(context.Context, int64, time.Time) error       { return nil }
func (*logoutAllSessionStub) RevokeSession(context.Context, int64, string) error         { return nil }
func (*logoutAllSessionStub) CreateRefreshToken(context.Context, *RefreshTokenRow) error { return nil }
func (*logoutAllSessionStub) GetRefreshTokenByHashForUpdate(context.Context, []byte) (*RefreshTokenRow, error) {
	return nil, nil
}
func (*logoutAllSessionStub) RotateRefreshToken(context.Context, int64, int64, time.Time) error {
	return nil
}
func (*logoutAllSessionStub) RevokeSessionTokens(context.Context, int64) error { return nil }
func (*logoutAllSessionStub) CreateLinkCode(context.Context, *LinkCode) error  { return nil }
func (*logoutAllSessionStub) CountActiveLinkCodes(context.Context, int64, time.Time) (int, error) {
	return 0, nil
}
func (*logoutAllSessionStub) GetLinkCodeByHashForUpdate(context.Context, []byte) (*LinkCode, error) {
	return nil, nil
}
func (*logoutAllSessionStub) ConsumeLinkCode(context.Context, int64, time.Time) error { return nil }

func TestLogoutAllRevokesAllSessionsForUser(t *testing.T) {
	sessions := &logoutAllSessionStub{}
	svc := NewService(nil, sessions, nil, nil, nil, nil, time.Minute, time.Hour, nil)

	if err := svc.LogoutAll(context.Background(), 42); err != nil {
		t.Fatalf("LogoutAll() error = %v", err)
	}
	if sessions.calls != 1 || sessions.userID != 42 || sessions.reason != "logout-all" {
		t.Fatalf("RevokeAllSessions calls=%d userID=%d reason=%q, want one logout-all call for user 42", sessions.calls, sessions.userID, sessions.reason)
	}
}

type immediateTx struct{}

func (immediateTx) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

type changePasswordUserStub struct {
	user        *User
	identity    *AuthIdentity
	updatedHash string
}

func (*changePasswordUserStub) CreateUser(context.Context, *User) error           { return nil }
func (*changePasswordUserStub) GetUserByID(context.Context, int64) (*User, error) { return nil, nil }
func (*changePasswordUserStub) GetUserByPublicID(context.Context, uuid.UUID) (*User, error) {
	return nil, nil
}
func (*changePasswordUserStub) GetLocalByUsername(context.Context, string) (*User, *AuthIdentity, error) {
	return nil, nil, nil
}
func (s *changePasswordUserStub) GetLocalByUserID(context.Context, int64) (*AuthIdentity, error) {
	return s.identity, nil
}
func (*changePasswordUserStub) GetWechatBySubject(context.Context, string) (*User, error) {
	return nil, nil
}
func (s *changePasswordUserStub) LockUserByID(context.Context, int64) (*User, error) {
	return s.user, nil
}
func (*changePasswordUserStub) CreateIdentity(context.Context, *AuthIdentity) error { return nil }
func (s *changePasswordUserStub) UpdateLocalCredentialHash(_ context.Context, _ int64, hash string, _ time.Time) error {
	s.updatedHash = hash
	return nil
}

func TestChangePasswordReplacesCredentialAndRevokesSessions(t *testing.T) {
	hasher := &Hasher{Time: 1, Memory: 1024, Parallelism: 1, KeyLen: 32, SaltLen: 16}
	oldHash, err := hasher.Hash("old-password")
	if err != nil {
		t.Fatalf("hash old password: %v", err)
	}
	users := &changePasswordUserStub{
		user:     &User{ID: 42, Status: UserActive},
		identity: &AuthIdentity{UserID: 42, CredentialHash: &oldHash},
	}
	sessions := &logoutAllSessionStub{}
	svc := NewService(users, sessions, immediateTx{}, hasher, nil, nil, time.Minute, time.Hour, nil)

	if err := svc.ChangePassword(context.Background(), 42, "old-password", "new-password"); err != nil {
		t.Fatalf("ChangePassword() error = %v", err)
	}
	valid, err := hasher.Verify(users.updatedHash, "new-password")
	if err != nil || !valid {
		t.Fatalf("updated credential does not verify, valid=%v err=%v", valid, err)
	}
	if sessions.calls != 1 || sessions.userID != 42 || sessions.reason != "password-changed" {
		t.Fatalf("session revocation = calls %d user %d reason %q", sessions.calls, sessions.userID, sessions.reason)
	}
}

func TestChangePasswordRejectsWrongCurrentPassword(t *testing.T) {
	hasher := &Hasher{Time: 1, Memory: 1024, Parallelism: 1, KeyLen: 32, SaltLen: 16}
	oldHash, err := hasher.Hash("old-password")
	if err != nil {
		t.Fatalf("hash old password: %v", err)
	}
	users := &changePasswordUserStub{
		user:     &User{ID: 42, Status: UserActive},
		identity: &AuthIdentity{UserID: 42, CredentialHash: &oldHash},
	}
	sessions := &logoutAllSessionStub{}
	svc := NewService(users, sessions, immediateTx{}, hasher, nil, nil, time.Minute, time.Hour, nil)

	err = svc.ChangePassword(context.Background(), 42, "wrong-password", "new-password")
	app, ok := apperr.As(err)
	if !ok || app.Code != apperr.CodeInvalidCredentials {
		t.Fatalf("ChangePassword() error = %v, want INVALID_CREDENTIALS", err)
	}
	if users.updatedHash != "" || sessions.calls != 0 {
		t.Fatalf("wrong password changed credential or revoked sessions")
	}
}
