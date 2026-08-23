package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

// UserLockRepo serializes per-user composition by locking the users row
// (docs/13 §10.1, docs/14 §5). Shared by account/task/entitlement services.
type UserLockRepo struct {
	pool *pgxpool.Pool
}

func NewUserLockRepo(pool *pgxpool.Pool) *UserLockRepo { return &UserLockRepo{pool: pool} }

func (r *UserLockRepo) LockUserForUpdate(ctx context.Context, userID int64) error {
	var one int
	err := From(ctx, r.pool).QueryRow(ctx,
		`SELECT 1 FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, userID).Scan(&one)
	if err != nil {
		return mapNoRows(err, apperr.CodeNotFound, "user not found")
	}
	return nil
}