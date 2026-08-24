package auth

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

type logoutAllSessionStub struct {
	userID int64
	calls  int
}

func (s *logoutAllSessionStub) RevokeAllSessions(_ context.Context, userID int64) error {
	s.userID = userID
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
	if sessions.calls != 1 || sessions.userID != 42 {
		t.Fatalf("RevokeAllSessions calls=%d userID=%d, want one call for user 42", sessions.calls, sessions.userID)
	}
}
