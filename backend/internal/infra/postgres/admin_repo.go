package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
)

type AdminRepo struct {
	pool *pgxpool.Pool
}

func NewAdminRepo(pool *pgxpool.Pool) *AdminRepo {
	return &AdminRepo{pool: pool}
}

func (r *AdminRepo) ListUserSummaries(ctx context.Context, limit int) ([]admin.UserSummary, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT
			u.public_id,
			u.display_name,
			u.role,
			u.status,
			u.created_at,
			(
				SELECT MAX(s.last_seen_at)
				FROM auth_sessions s
				WHERE s.user_id = u.id AND s.client_type IN ('web', 'admin')
			) AS last_login_at,
			(
				SELECT COUNT(*)::int
				FROM douyin_accounts a
				WHERE a.user_id = u.id AND a.deleted_at IS NULL
			) AS account_count,
			(
				SELECT COUNT(*)::int
				FROM spark_tasks t
				WHERE t.user_id = u.id AND t.deleted_at IS NULL
			) AS task_count,
			(
				SELECT MAX(g.expires_at)
				FROM entitlement_grants g
				WHERE g.user_id = u.id AND g.revoked_at IS NULL
			) AS entitlement_expires_at
		FROM users u
		WHERE u.deleted_at IS NULL
		ORDER BY u.created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]admin.UserSummary, 0)
	for rows.Next() {
		var item admin.UserSummary
		if err := rows.Scan(
			&item.PublicID,
			&item.DisplayName,
			&item.Role,
			&item.Status,
			&item.CreatedAt,
			&item.LastLoginAt,
			&item.AccountCount,
			&item.TaskCount,
			&item.EntitlementExpiresAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

var _ admin.Repository = (*AdminRepo)(nil)
