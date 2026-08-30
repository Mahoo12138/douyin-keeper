package auth

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// UserRepository defines the auth context's persistence contract. The pgx
// implementation resolves the current tx handle from ctx (see
// infra/postgres.From), so it is safe to call inside TxManager.WithinTx.
type UserRepository interface {
	CreateUser(ctx context.Context, u *User) error
	GetUserByID(ctx context.Context, id int64) (*User, error)
	GetUserByPublicID(ctx context.Context, publicID uuid.UUID) (*User, error)
	// GetLocalByUsername joins users with the local identity row.
	GetLocalByUsername(ctx context.Context, username string) (*User, *AuthIdentity, error)
	// GetLocalByUserID resolves the local credential owned by an authenticated user.
	GetLocalByUserID(ctx context.Context, userID int64) (*AuthIdentity, error)
	// GetWechatBySubject resolves an already-linked mini-program identity.
	GetWechatBySubject(ctx context.Context, subject string) (*User, error)
	// LockUserForUpdate obtains a FOR UPDATE row lock inside a tx.
	LockUserByID(ctx context.Context, id int64) (*User, error)
	CreateIdentity(ctx context.Context, idn *AuthIdentity) error
	UpdateLocalCredentialHash(ctx context.Context, userID int64, credentialHash string, updatedAt time.Time) error
}

// SessionRepository covers auth_sessions + auth_refresh_tokens + link codes.
type SessionRepository interface {
	CreateSession(ctx context.Context, s *AuthSession) error
	GetSessionByPublicID(ctx context.Context, publicID uuid.UUID) (*AuthSession, error)
	GetSessionByID(ctx context.Context, id int64) (*AuthSession, error)
	TouchSession(ctx context.Context, id int64, at time.Time) error
	RevokeSession(ctx context.Context, id int64, reason string) error
	RevokeAllSessions(ctx context.Context, userID int64, reason string) error

	CreateRefreshToken(ctx context.Context, t *RefreshTokenRow) error
	// GetRefreshTokenByHashForUpdate locks the row (reuse detection).
	GetRefreshTokenByHashForUpdate(ctx context.Context, hash []byte) (*RefreshTokenRow, error)
	RotateRefreshToken(ctx context.Context, oldID, newID int64, usedAt time.Time) error
	RevokeSessionTokens(ctx context.Context, sessionID int64) error

	CreateLinkCode(ctx context.Context, lc *LinkCode) error
	CountActiveLinkCodes(ctx context.Context, userID int64, now time.Time) (int, error)
	GetLinkCodeByHashForUpdate(ctx context.Context, hash []byte) (*LinkCode, error)
	ConsumeLinkCode(ctx context.Context, id int64, at time.Time) error
}
