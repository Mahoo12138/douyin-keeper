package auth

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

// TxManager is implemented by infra/postgres.TxManager. It keeps this domain
// package free of infra imports (docs/14 §6).
type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}

// Service orchestrates register/login/refresh/logout and the WeChat link-code
// flow. WeChat code exchange is injected so the domain stays independent from
// the external HTTP client; cmd/api uses the real adapter when configured and
// the explicit not-linked stub otherwise.
type Service struct {
	users         UserRepository
	sessions      SessionRepository
	tx            TxManager
	hasher        *Hasher
	now           func() time.Time
	signingKey    []byte
	refreshPepper []byte
	accessTTL     time.Duration
	refreshTTL    time.Duration
	wechat        WechatExchanger // nil until M4
}

// WechatExchanger swaps a wx.login code for the normalized wechat subject.
// The infra adapter implements it with the real jscode2session client; tests
// and unconfigured deployments may provide the explicit not-linked stub.
type WechatExchanger interface {
	ExchangeForSubject(ctx context.Context, wechatCode string) (string, error)
}

func NewService(users UserRepository, sessions SessionRepository, tx TxManager,
	hasher *Hasher, signingKey []byte, refreshPepper []byte,
	accessTTL, refreshTTL time.Duration, wechat WechatExchanger) *Service {
	return &Service{
		users: users, sessions: sessions, tx: tx, hasher: hasher,
		now: time.Now, signingKey: signingKey, refreshPepper: refreshPepper,
		accessTTL: accessTTL, refreshTTL: refreshTTL, wechat: wechat,
	}
}

// SetNow overrides the clock for tests.
func (s *Service) SetNow(f func() time.Time) { s.now = f }

// NormalizeUsername canonicalizes a local provider subject (docs/13 §2.2).
func NormalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

// Register creates a user + local identity in one tx, then issues a session.
func (s *Service) Register(ctx context.Context, username, password string) (SessionResult, error) {
	if len(username) < 3 || len(username) > 64 {
		return SessionResult{}, apperr.Validation(apperr.CodeConflict, "username must be 3-64 characters")
	}
	if len(password) < 8 || len(password) > 256 {
		return SessionResult{}, apperr.Validation(apperr.CodeConflict, "password must be 8-256 characters")
	}
	subj := NormalizeUsername(username)
	hash, err := s.hasher.Hash(password)
	if err != nil {
		return SessionResult{}, err
	}

	var user *User
	err = s.tx.WithinTx(ctx, func(tctx context.Context) error {
		u := &User{
			PublicID: uuid.New(), Role: RoleUser, Status: UserActive,
			DisplayName: subj, Timezone: "Asia/Shanghai",
			CreatedAt: s.now(), UpdatedAt: s.now(),
		}
		if err := s.users.CreateUser(tctx, u); err != nil {
			return err
		}
		idn := &AuthIdentity{UserID: u.ID, Provider: "local", ProviderSubject: subj, CredentialHash: &hash, CreatedAt: s.now(), UpdatedAt: s.now()}
		if err := s.users.CreateIdentity(tctx, idn); err != nil {
			return err
		}
		user = u
		return nil
	})
	if err != nil {
		if apperr.KindOf(err) == apperr.KindConflict {
			return SessionResult{}, err
		}
		return SessionResult{}, apperr.Wrap(apperr.CodeInternal, apperr.KindInternal, "register failed", err)
	}
	return s.newSession(ctx, user, ClientWeb)
}

// Login verifies local credentials and starts a web session.
func (s *Service) Login(ctx context.Context, username, password string, client ClientType) (SessionResult, error) {
	user, idn, err := s.users.GetLocalByUsername(ctx, NormalizeUsername(username))
	if err != nil {
		if apperr.KindOf(err) == apperr.KindNotFound {
			// Same response for unknown user and bad password (docs/13 §3.1).
			return SessionResult{}, apperr.Unauthorized(apperr.CodeInvalidCredentials, "invalid username or password")
		}
		return SessionResult{}, err
	}
	if idn == nil {
		return SessionResult{}, apperr.Unauthorized(apperr.CodeInvalidCredentials, "invalid username or password")
	}
	ok, err := s.hasher.Verify(*idn.CredentialHash, password)
	if err != nil || !ok {
		return SessionResult{}, apperr.Unauthorized(apperr.CodeInvalidCredentials, "invalid username or password")
	}
	if !user.IsActive() {
		return SessionResult{}, apperr.New(apperr.CodeUserDisabled, apperr.KindForbidden, "account is disabled")
	}
	return s.newSession(ctx, user, client)
}

// Refresh rotates the refresh token with reuse detection (docs/13 §4). The old
// token remains stored (used_at + replaced_by_id) for replay detection.
func (s *Service) Refresh(ctx context.Context, token string, client ClientType) (SessionResult, error) {
	if token == "" {
		return SessionResult{}, apperr.Unauthorized(apperr.CodeUnauthenticated, "missing refresh token")
	}
	hash := HashRefreshToken(s.refreshPepper, token)
	var out SessionResult
	err := s.tx.WithinTx(ctx, func(tctx context.Context) error {
		row, err := s.sessions.GetRefreshTokenByHashForUpdate(tctx, hash)
		if err != nil {
			if apperr.KindOf(err) == apperr.KindNotFound {
				return apperr.Unauthorized(apperr.CodeUnauthenticated, "invalid refresh token")
			}
			return err
		}
		now := s.now()
		if row.UsedAt != nil || row.RevokedAt != nil {
			// Replay of an already-rotated token: kill the whole session.
			_ = s.sessions.RevokeSession(tctx, row.SessionID, "refresh token reuse")
			_ = s.sessions.RevokeSessionTokens(tctx, row.SessionID)
			return apperr.Unauthorized(apperr.CodeUnauthenticated, "session revoked")
		}
		if !row.ExpiresAt.After(now) {
			_ = s.sessions.RevokeSession(tctx, row.SessionID, "refresh token expired")
			_ = s.sessions.RevokeSessionTokens(tctx, row.SessionID)
			return apperr.Unauthorized(apperr.CodeUnauthenticated, "session expired")
		}
		sess, err := s.sessions.GetSessionByID(tctx, row.SessionID)
		if err != nil {
			return err
		}
		if !sess.IsValid(now) {
			_ = s.sessions.RevokeSessionTokens(tctx, sess.ID)
			return apperr.Unauthorized(apperr.CodeUnauthenticated, "session revoked")
		}
		user, err := s.users.GetUserByID(tctx, sess.UserID)
		if err != nil {
			return err
		}
		if !user.IsActive() {
			return apperr.New(apperr.CodeUserDisabled, apperr.KindForbidden, "account is disabled")
		}

		newToken, newHash, err := NewRefreshToken(s.refreshPepper)
		if err != nil {
			return err
		}
		newRow := &RefreshTokenRow{SessionID: sess.ID, TokenHash: newHash, ExpiresAt: now.Add(s.refreshTTL)}
		if err := s.sessions.CreateRefreshToken(tctx, newRow); err != nil {
			return err
		}
		if err := s.sessions.RotateRefreshToken(tctx, row.ID, newRow.ID, now); err != nil {
			return err
		}
		if err := s.sessions.TouchSession(tctx, sess.ID, now); err != nil {
			return err
		}

		access, err := IssueAccess(s.signingKey, s.accessTTL, user, sess.PublicID.String(), client, now)
		if err != nil {
			return err
		}
		out = SessionResult{AccessToken: access, ExpiresIn: int64(s.accessTTL.Seconds()), RefreshToken: newToken, User: user}
		return nil
	})
	if err != nil {
		return SessionResult{}, err
	}
	return out, nil
}

// Logout revokes the current session and its refresh tokens.
func (s *Service) Logout(ctx context.Context, sessionID int64) error {
	return s.tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := s.sessions.RevokeSessionTokens(tctx, sessionID); err != nil {
			return err
		}
		return s.sessions.RevokeSession(tctx, sessionID, "logout")
	})
}

// LogoutAll revokes every session of the user except the current one.
func (s *Service) LogoutAll(ctx context.Context, userID int64, exceptSessionID int64) error {
	return s.sessions.RevokeAllSessions(ctx, userID, exceptSessionID)
}

// GetUserByPublicID resolves the current user for GET /me.
func (s *Service) GetUserByPublicID(ctx context.Context, publicID uuid.UUID) (*User, error) {
	u, err := s.users.GetUserByPublicID(ctx, publicID)
	if err != nil {
		return nil, err
	}
	if !u.IsActive() {
		return nil, apperr.New(apperr.CodeUserDisabled, apperr.KindForbidden, "account is disabled")
	}
	return u, nil
}

// GetUserByPublicIDForAdmin resolves a user for an administrator view without
// applying the end-user active-status gate. Admin workflows need to inspect
// disabled users while still never receiving credential or session data.
func (s *Service) GetUserByPublicIDForAdmin(ctx context.Context, publicID uuid.UUID) (*User, error) {
	return s.users.GetUserByPublicID(ctx, publicID)
}

// newSession creates an AuthSession + first refresh token in one tx.
func (s *Service) newSession(ctx context.Context, user *User, client ClientType) (SessionResult, error) {
	var out SessionResult
	now := s.now()
	err := s.tx.WithinTx(ctx, func(tctx context.Context) error {
		sess := &AuthSession{
			PublicID: uuid.New(), UserID: user.ID, ClientType: client,
			ExpiresAt: now.Add(s.refreshTTL), CreatedAt: now,
		}
		if err := s.sessions.CreateSession(tctx, sess); err != nil {
			return err
		}
		raw, hash, err := NewRefreshToken(s.refreshPepper)
		if err != nil {
			return err
		}
		if err := s.sessions.CreateRefreshToken(tctx, &RefreshTokenRow{
			SessionID: sess.ID, TokenHash: hash, ExpiresAt: now.Add(s.refreshTTL),
		}); err != nil {
			return err
		}
		access, err := IssueAccess(s.signingKey, s.accessTTL, user, sess.PublicID.String(), client, now)
		if err != nil {
			return err
		}
		out = SessionResult{AccessToken: access, ExpiresIn: int64(s.accessTTL.Seconds()), RefreshToken: raw, User: user}
		return nil
	})
	return out, err
}

// CreateAdminUser is used by the seed command (idempotent by username).
func (s *Service) CreateAdminUser(ctx context.Context, username, password string) (*User, bool, error) {
	subj := NormalizeUsername(username)
	if u, _, err := s.users.GetLocalByUsername(ctx, subj); err == nil {
		return u, false, nil // already exists
	}
	hash, err := s.hasher.Hash(password)
	if err != nil {
		return nil, false, err
	}
	var user *User
	err = s.tx.WithinTx(ctx, func(tctx context.Context) error {
		u := &User{
			PublicID: uuid.New(), Role: RoleAdmin, Status: UserActive,
			DisplayName: subj, Timezone: "Asia/Shanghai", CreatedAt: s.now(), UpdatedAt: s.now(),
		}
		if err := s.users.CreateUser(tctx, u); err != nil {
			return err
		}
		idn := &AuthIdentity{UserID: u.ID, Provider: "local", ProviderSubject: subj, CredentialHash: &hash, CreatedAt: s.now(), UpdatedAt: s.now()}
		if err := s.users.CreateIdentity(tctx, idn); err != nil {
			return err
		}
		user = u
		return nil
	})
	return user, true, err
}
