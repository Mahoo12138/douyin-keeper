package postgres

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
)

// AuthSessionRepo implements auth.SessionRepository.
type AuthSessionRepo struct {
	pool *pgxpool.Pool
}

func NewAuthSessionRepo(pool *pgxpool.Pool) *AuthSessionRepo { return &AuthSessionRepo{pool: pool} }

const sessionCols = `id, public_id, user_id, client_type, expires_at, last_seen_at, revoked_at, revoke_reason, created_at`

func scanSession(row pgx.Row) (*auth.AuthSession, error) {
	var s auth.AuthSession
	err := row.Scan(&s.ID, &s.PublicID, &s.UserID, &s.ClientType, &s.ExpiresAt, &s.LastSeenAt, &s.RevokedAt, &s.RevokeReason, &s.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *AuthSessionRepo) CreateSession(ctx context.Context, s *auth.AuthSession) error {
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO auth_sessions (public_id, user_id, client_type, expires_at, created_at)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id
	`, s.PublicID, s.UserID, s.ClientType, s.ExpiresAt, s.CreatedAt).Scan(&s.ID)
}

func (r *AuthSessionRepo) GetSessionByPublicID(ctx context.Context, publicID uuid.UUID) (*auth.AuthSession, error) {
	s, err := scanSession(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+sessionCols+` FROM auth_sessions WHERE public_id = $1`, publicID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "session not found")
	}
	return s, nil
}

func (r *AuthSessionRepo) GetSessionByID(ctx context.Context, id int64) (*auth.AuthSession, error) {
	s, err := scanSession(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+sessionCols+` FROM auth_sessions WHERE id = $1`, id))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "session not found")
	}
	return s, nil
}

func (r *AuthSessionRepo) TouchSession(ctx context.Context, id int64, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx,
		`UPDATE auth_sessions SET last_seen_at = $2 WHERE id = $1`, id, at)
	return err
}

func (r *AuthSessionRepo) RevokeSession(ctx context.Context, id int64, reason string) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE auth_sessions SET revoked_at = now(), revoke_reason = $2
		WHERE id = $1 AND revoked_at IS NULL`, id, reason)
	return err
}

func (r *AuthSessionRepo) RevokeAllSessions(ctx context.Context, userID int64, exceptSessionID int64) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'logout-all'
		WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`, userID, exceptSessionID)
	return err
}

const refreshCols = `id, session_id, token_hash, expires_at, used_at, revoked_at, replaced_by_id, created_at`

func scanRefresh(row pgx.Row) (*auth.RefreshTokenRow, error) {
	var t auth.RefreshTokenRow
	err := row.Scan(&t.ID, &t.SessionID, &t.TokenHash, &t.ExpiresAt, &t.UsedAt, &t.RevokedAt, &t.ReplacedByID, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *AuthSessionRepo) CreateRefreshToken(ctx context.Context, t *auth.RefreshTokenRow) error {
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO auth_refresh_tokens (session_id, token_hash, expires_at, created_at)
		VALUES ($1,$2,$3,$4)
		RETURNING id
	`, t.SessionID, t.TokenHash, t.ExpiresAt, t.CreatedAt).Scan(&t.ID)
}

func (r *AuthSessionRepo) GetRefreshTokenByHashForUpdate(ctx context.Context, hash []byte) (*auth.RefreshTokenRow, error) {
	t, err := scanRefresh(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+refreshCols+` FROM auth_refresh_tokens WHERE token_hash = $1 FOR UPDATE`, hash))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "refresh token not found")
	}
	return t, nil
}

func (r *AuthSessionRepo) RotateRefreshToken(ctx context.Context, oldID, newID int64, usedAt time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE auth_refresh_tokens
		SET used_at = $2, replaced_by_id = $3
		WHERE id = $1`, oldID, usedAt, newID)
	return err
}

func (r *AuthSessionRepo) RevokeSessionTokens(ctx context.Context, sessionID int64) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE auth_refresh_tokens SET revoked_at = now()
		WHERE session_id = $1 AND revoked_at IS NULL AND used_at IS NULL`, sessionID)
	return err
}

func (r *AuthSessionRepo) CreateLinkCode(ctx context.Context, lc *auth.LinkCode) error {
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO auth_link_codes (public_id, user_id, code_hash, code_fingerprint, expires_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id
	`, lc.PublicID, lc.UserID, lc.CodeHash, lc.CodeFingerprint, lc.ExpiresAt, lc.CreatedAt).Scan(&lc.ID)
}

func (r *AuthSessionRepo) CountActiveLinkCodes(ctx context.Context, userID int64, now time.Time) (int, error) {
	var count int
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT COUNT(*)::int FROM auth_link_codes
		WHERE user_id=$1 AND consumed_at IS NULL AND expires_at > $2`, userID, now).Scan(&count)
	return count, err
}

const linkCodeCols = `id, public_id, user_id, code_hash, code_fingerprint, expires_at, consumed_at, created_at`

func scanLinkCode(row pgx.Row) (*auth.LinkCode, error) {
	var lc auth.LinkCode
	err := row.Scan(&lc.ID, &lc.PublicID, &lc.UserID, &lc.CodeHash, &lc.CodeFingerprint,
		&lc.ExpiresAt, &lc.ConsumedAt, &lc.CreatedAt)
	return &lc, err
}

func (r *AuthSessionRepo) GetLinkCodeByHashForUpdate(ctx context.Context, hash []byte) (*auth.LinkCode, error) {
	lc, err := scanLinkCode(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+linkCodeCols+` FROM auth_link_codes WHERE code_hash = $1 FOR UPDATE`, hash))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeLinkCodeInvalid, "link code is invalid")
	}
	return lc, nil
}

func (r *AuthSessionRepo) ConsumeLinkCode(ctx context.Context, id int64, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE auth_link_codes SET consumed_at=$2
		WHERE id=$1 AND consumed_at IS NULL`, id, at)
	return err
}
