// Package auth owns the user principal, identities, sessions and refresh-token
// rotation (docs/13 §2–§7). It does not own entitlement, cookies, or WeChat
// HTTP details.
package auth

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type Role string

const (
	RoleUser  Role = "user"
	RoleAdmin Role = "admin"
)

type UserStatus string

const (
	UserActive  UserStatus = "active"
	UserDisabled UserStatus = "disabled"
)

type ClientType string

const (
	ClientWeb   ClientType = "web"
	ClientMini  ClientType = "mini"
	ClientAdmin ClientType = "admin"
)

type User struct {
	ID          int64
	PublicID    uuid.UUID
	Role        Role
	Status      UserStatus
	DisplayName string
	Timezone    string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   *time.Time
}

func (u *User) IsActive() bool { return u.Status == UserActive && u.DeletedAt == nil }

// AuthIdentity links a provider subject (username or wechat subject) to a user.
type AuthIdentity struct {
	ID              int64
	UserID          int64
	Provider        string // local | wechat_mini
	ProviderSubject string
	CredentialHash  *string // NULL for wechat_mini
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// AuthSession is a revocable server-side login session (docs/13 §4).
type AuthSession struct {
	ID         int64
	PublicID   uuid.UUID
	UserID     int64
	ClientType ClientType
	ExpiresAt  time.Time
	LastSeenAt *time.Time
	RevokedAt  *time.Time
	RevokeReason *string
	CreatedAt  time.Time
}

func (s *AuthSession) IsValid(now time.Time) bool {
	return s.RevokedAt == nil && s.ExpiresAt.After(now)
}

// RefreshTokenRow stores only the keyed hash of a refresh token, plus its
// rotation chain for reuse detection (docs/13 §4 step 7).
type RefreshTokenRow struct {
	ID          int64
	SessionID   int64
	TokenHash   []byte
	ExpiresAt   time.Time
	UsedAt      *time.Time
	RevokedAt   *time.Time
	ReplacedByID *int64
	CreatedAt   time.Time
}

// Principal is what auth middleware puts into the request context (docs/13 §7).
type Principal struct {
	UserID       int64
	UserPublicID uuid.UUID
	SessionID    int64
	Role         Role
	ClientType   ClientType
}

type principalKey struct{}

func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

func PrincipalFrom(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok
}

func MustPrincipal(ctx context.Context) Principal {
	p, _ := PrincipalFrom(ctx)
	return p
}

// SessionResult is returned by Register/Login/Refresh. For web the refresh
// token normally travels in an HttpOnly cookie; for mini it is returned so the
// client stores it (docs/13 §4). AccessToken is never persisted client-side
// beyond memory.
type SessionResult struct {
	AccessToken  string
	ExpiresIn    int64 // seconds
	RefreshToken string // empty when the caller manages the cookie
	User         *User
}