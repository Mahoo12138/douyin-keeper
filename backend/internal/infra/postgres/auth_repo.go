package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
)

// AuthUserRepo implements auth.UserRepository with raw SQL and user scoping
// (docs/14 §7). All methods resolve the current tx from ctx.
type AuthUserRepo struct {
	pool *pgxpool.Pool
}

func NewAuthUserRepo(pool *pgxpool.Pool) *AuthUserRepo { return &AuthUserRepo{pool: pool} }

const userCols = `id, public_id, role, status, display_name, timezone, created_at, updated_at, deleted_at`

func scanUser(row pgx.Row) (*auth.User, error) {
	var u auth.User
	err := row.Scan(&u.ID, &u.PublicID, &u.Role, &u.Status, &u.DisplayName, &u.Timezone, &u.CreatedAt, &u.UpdatedAt, &u.DeletedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *AuthUserRepo) CreateUser(ctx context.Context, u *auth.User) error {
	err := From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO users (public_id, role, status, display_name, timezone, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id, created_at
	`, u.PublicID, u.Role, u.Status, u.DisplayName, u.Timezone, u.CreatedAt, u.CreatedAt).Scan(&u.ID, &u.CreatedAt)
	if isUniqueViolation(err) {
		return apperr.Conflict(apperr.CodeConflict, "username already exists")
	}
	return err
}

func (r *AuthUserRepo) GetUserByID(ctx context.Context, id int64) (*auth.User, error) {
	row := From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE id = $1 AND deleted_at IS NULL`, id)
	u, err := scanUser(row)
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "user not found")
	}
	return u, nil
}

func (r *AuthUserRepo) GetUserByPublicID(ctx context.Context, publicID uuid.UUID) (*auth.User, error) {
	row := From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE public_id = $1 AND deleted_at IS NULL`, publicID)
	u, err := scanUser(row)
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "user not found")
	}
	return u, nil
}

func (r *AuthUserRepo) GetLocalByUsername(ctx context.Context, username string) (*auth.User, *auth.AuthIdentity, error) {
	db := From(ctx, r.pool)
	var idn auth.AuthIdentity
	var userID int64
	err := db.QueryRow(ctx, `
		SELECT ai.id, ai.user_id, ai.provider, ai.provider_subject, ai.credential_hash, ai.created_at, ai.updated_at
		FROM auth_identities ai
		WHERE ai.provider = 'local' AND ai.provider_subject = $1
	`, username).Scan(&idn.ID, &userID, &idn.Provider, &idn.ProviderSubject, &idn.CredentialHash, &idn.CreatedAt, &idn.UpdatedAt)
	if err != nil {
		return nil, nil, mapNoRows(err, apperr.CodeNotFound, "identity not found")
	}
	idn.UserID = userID
	u, err := scanUser(db.QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE id = $1 AND deleted_at IS NULL`, userID))
	if err != nil {
		return nil, nil, mapNoRows(err, apperr.CodeNotFound, "user not found")
	}
	return u, &idn, nil
}

func (r *AuthUserRepo) GetLocalByUserID(ctx context.Context, userID int64) (*auth.AuthIdentity, error) {
	var idn auth.AuthIdentity
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT id, user_id, provider, provider_subject, credential_hash, created_at, updated_at
		FROM auth_identities
		WHERE provider = 'local' AND user_id = $1
	`, userID).Scan(&idn.ID, &idn.UserID, &idn.Provider, &idn.ProviderSubject, &idn.CredentialHash, &idn.CreatedAt, &idn.UpdatedAt)
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "local identity not found")
	}
	return &idn, nil
}

func (r *AuthUserRepo) GetWechatBySubject(ctx context.Context, subject string) (*auth.User, error) {
	u, err := scanUser(From(ctx, r.pool).QueryRow(ctx, `
		SELECT u.id, u.public_id, u.role, u.status, u.display_name, u.timezone,
		       u.created_at, u.updated_at, u.deleted_at
		FROM auth_identities ai
		JOIN users u ON u.id = ai.user_id
		WHERE ai.provider = 'wechat_mini' AND ai.provider_subject = $1
		  AND u.deleted_at IS NULL`, subject))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "wechat identity not found")
	}
	return u, nil
}

func (r *AuthUserRepo) LockUserByID(ctx context.Context, id int64) (*auth.User, error) {
	u, err := scanUser(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE id = $1 FOR UPDATE`, id))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "user not found")
	}
	return u, nil
}

func (r *AuthUserRepo) CreateIdentity(ctx context.Context, idn *auth.AuthIdentity) error {
	err := From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO auth_identities (user_id, provider, provider_subject, credential_hash, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id
	`, idn.UserID, idn.Provider, idn.ProviderSubject, idn.CredentialHash, idn.CreatedAt, idn.CreatedAt).Scan(&idn.ID)
	if isUniqueViolation(err) {
		return apperr.Conflict(apperr.CodeConflict, "identity already exists")
	}
	return err
}

func (r *AuthUserRepo) UpdateLocalCredentialHash(ctx context.Context, userID int64, credentialHash string, updatedAt time.Time) error {
	tag, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE auth_identities
		SET credential_hash = $2, updated_at = $3
		WHERE user_id = $1 AND provider = 'local'
	`, userID, credentialHash, updatedAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return apperr.NotFound(apperr.CodeNotFound, "local identity not found")
	}
	return nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func mapNoRows(err error, code, msg string) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.NotFound(code, msg)
	}
	return err
}
