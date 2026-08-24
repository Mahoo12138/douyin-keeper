package postgres

import (
	"context"
	"encoding/json"
	"time"

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

func (r *AdminRepo) ListAccountSummaries(ctx context.Context, limit int) ([]admin.AccountSummary, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT
			a.public_id,
			u.public_id,
			u.display_name,
			a.platform_user_id,
			a.nickname,
			a.binding_status,
			a.session_status,
			a.risk_status,
			a.paused_at,
			a.cooldown_until,
			a.last_session_check_at,
			a.last_friend_sync_at,
			COALESCE((
				SELECT jsonb_agg(jsonb_build_object(
					'Name', c.capability,
					'Status', c.status,
					'Adapter', c.adapter,
					'ErrorCode', c.error_code,
					'CheckedAt', c.checked_at
				) ORDER BY c.capability)
				FROM capability_snapshots c
				WHERE c.account_id = a.id
			), '[]'::jsonb) AS capabilities,
			(
				SELECT COUNT(*)::int
				FROM send_intents i
				WHERE i.account_id = a.id AND i.local_date = CURRENT_DATE AND i.status = 'succeeded'
			) AS today_send_succeeded,
			(
				SELECT COUNT(*)::int
				FROM send_intents i
				WHERE i.account_id = a.id AND i.local_date = CURRENT_DATE AND i.status = 'failed'
			) AS today_send_failed,
			e.category,
			e.code,
			e.severity,
			e.source_adapter,
			e.created_at
		FROM douyin_accounts a
		JOIN users u ON u.id = a.user_id
		LEFT JOIN LATERAL (
			SELECT category, code, severity, source_adapter, created_at
			FROM risk_events
			WHERE account_id = a.id
			ORDER BY created_at DESC
			LIMIT 1
		) e ON true
		WHERE a.deleted_at IS NULL AND u.deleted_at IS NULL
		ORDER BY a.created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]admin.AccountSummary, 0)
	for rows.Next() {
		var item admin.AccountSummary
		var rawCapabilities []byte
		var errorCategory, errorCode, errorSeverity string
		var errorSourceAdapter *string
		var errorCreatedAt *time.Time
		if err := rows.Scan(
			&item.PublicID,
			&item.OwnerPublicID,
			&item.OwnerDisplayName,
			&item.PlatformUserID,
			&item.Nickname,
			&item.BindingStatus,
			&item.SessionStatus,
			&item.RiskStatus,
			&item.PausedAt,
			&item.CooldownUntil,
			&item.LastSessionCheckAt,
			&item.LastFriendSyncAt,
			&rawCapabilities,
			&item.TodaySendSucceeded,
			&item.TodaySendFailed,
			&errorCategory,
			&errorCode,
			&errorSeverity,
			&errorSourceAdapter,
			&errorCreatedAt,
		); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(rawCapabilities, &item.Capabilities); err != nil {
			return nil, err
		}
		if errorCreatedAt != nil {
			item.LatestError = &admin.RecentError{
				Category: errorCategory, Code: errorCode, Severity: errorSeverity,
				SourceAdapter: errorSourceAdapter, CreatedAt: *errorCreatedAt,
			}
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

var _ admin.Repository = (*AdminRepo)(nil)
