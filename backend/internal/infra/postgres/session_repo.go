package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/session"
)

type SessionRepo struct{ pool *pgxpool.Pool }

func NewSessionRepo(pool *pgxpool.Pool) *SessionRepo { return &SessionRepo{pool: pool} }

const accountSessionCols = `id, account_id, version, key_version, cipher_alg,
	ciphertext, aad_version, created_at, last_validated_at, revoked_at`

func scanAccountSession(row pgx.Row) (*session.Stored, error) {
	var s session.Stored
	err := row.Scan(&s.ID, &s.AccountID, &s.Version, &s.KeyVersion, &s.CipherAlgorithm,
		&s.Ciphertext, &s.AADVersion, &s.CreatedAt, &s.LastValidatedAt, &s.RevokedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *SessionRepo) GetActive(ctx context.Context, accountID int64) (*session.Stored, error) {
	s, err := scanAccountSession(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+accountSessionCols+` FROM account_sessions
		WHERE account_id=$1 AND revoked_at IS NULL
		ORDER BY version DESC LIMIT 1`, accountID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeSessionExpired, "account session is unavailable")
	}
	return s, nil
}

func (r *SessionRepo) ReplaceActive(ctx context.Context, req session.ReplaceRequest) (*session.Stored, error) {
	db := From(ctx, r.pool)
	if _, err := db.Exec(ctx, `
		UPDATE account_sessions SET revoked_at=COALESCE(revoked_at, now())
		WHERE account_id=$1 AND revoked_at IS NULL`, req.AccountID); err != nil {
		return nil, err
	}
	var version int
	if err := db.QueryRow(ctx, `
		SELECT COALESCE(MAX(version), 0) + 1 FROM account_sessions WHERE account_id=$1`, req.AccountID).Scan(&version); err != nil {
		return nil, err
	}
	return scanAccountSession(db.QueryRow(ctx, `
		INSERT INTO account_sessions
		(account_id, version, key_version, cipher_alg, ciphertext, aad_version, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING `+accountSessionCols,
		req.AccountID, version, req.KeyVersion, req.CipherAlgorithm, req.Ciphertext,
		req.AADVersion, req.CreatedAt))
}

func (r *SessionRepo) MarkValidated(ctx context.Context, sessionID int64, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE account_sessions SET last_validated_at=$2 WHERE id=$1 AND revoked_at IS NULL`, sessionID, at)
	return err
}

var _ session.Repository = (*SessionRepo)(nil)
