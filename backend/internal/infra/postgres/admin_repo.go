package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

type AdminRepo struct {
	pool               *pgxpool.Pool
	inspector          *asynq.Inspector
	redis              *redis.Client
	executableAdapters map[string]bool
}

func NewAdminRepo(pool *pgxpool.Pool, rdb *redis.Client) *AdminRepo {
	repo := &AdminRepo{pool: pool, redis: rdb, executableAdapters: map[string]bool{"browser.consumer": true}}
	if rdb != nil {
		repo.inspector = asynq.NewInspectorFromRedisClient(rdb)
	}
	return repo
}

// SetAdapterExecutable reflects the verified runtime catalog in the Admin
// projection. Browser consumer is executable by default; optional runtimes
// such as Protocol are enabled only after their bundle passes startup checks.
func (r *AdminRepo) SetAdapterExecutable(adapter string, executable bool) *AdminRepo {
	if r.executableAdapters == nil {
		r.executableAdapters = map[string]bool{"browser.consumer": true}
	}
	r.executableAdapters[adapter] = executable
	return r
}

func (r *AdminRepo) ListUserSummaries(ctx context.Context, limit int) ([]admin.UserSummary, error) {
	return r.listUserSummaries(ctx, admin.UserListFilter{Limit: limit}, nil)
}

func (r *AdminRepo) ListUserSummariesPage(ctx context.Context, filter admin.UserListFilter) ([]admin.UserSummary, error) {
	filter.Limit++
	return r.listUserSummaries(ctx, filter, nil)
}

func (r *AdminRepo) GetUserSummary(ctx context.Context, publicID uuid.UUID) (admin.UserSummary, error) {
	items, err := r.listUserSummaries(ctx, admin.UserListFilter{Limit: 1}, &publicID)
	if err != nil {
		return admin.UserSummary{}, err
	}
	if len(items) != 1 {
		return admin.UserSummary{}, apperr.NotFound(apperr.CodeNotFound, "user not found")
	}
	return items[0], nil
}

func (r *AdminRepo) ListJobSummaries(ctx context.Context, filter admin.JobListFilter) ([]admin.JobSummary, error) {
	return r.listJobSummaries(ctx, filter)
}

func (r *AdminRepo) ListJobSummariesPage(ctx context.Context, filter admin.JobListFilter) ([]admin.JobSummary, error) {
	filter.Limit++
	return r.listJobSummaries(ctx, filter)
}

func (r *AdminRepo) listJobSummaries(ctx context.Context, filter admin.JobListFilter) ([]admin.JobSummary, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT
			j.id,
			j.public_id,
			u.public_id,
			a.public_id,
			j.type,
			j.status,
			j.error_code,
			j.cancelable,
			j.cancel_requested_at,
			j.worker_id,
			j.heartbeat_at,
			j.lease_expires_at,
			j.created_at,
			j.started_at,
			j.finished_at
		FROM jobs j
		LEFT JOIN users u ON u.id = j.user_id
		LEFT JOIN douyin_accounts a ON a.id = j.account_id
		WHERE ($1 = '' OR j.status = $1)
		  AND ($2 = '' OR j.type = $2)
		  AND ($3::timestamptz IS NULL OR (j.created_at,j.id) < ($3::timestamptz,$4::bigint))
		ORDER BY j.created_at DESC, j.id DESC
		LIMIT $5`, filter.Status, filter.Type, filter.AfterCreatedAt, filter.AfterID, filter.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]admin.JobSummary, 0)
	for rows.Next() {
		var item admin.JobSummary
		var userPublicID, accountPublicID *uuid.UUID
		if err := rows.Scan(
			&item.ID, &item.PublicID, &userPublicID, &accountPublicID, &item.Type, &item.Status,
			&item.ErrorCode, &item.Cancelable, &item.CancelRequestedAt, &item.WorkerID,
			&item.HeartbeatAt, &item.LeaseExpiresAt, &item.CreatedAt, &item.StartedAt, &item.FinishedAt,
		); err != nil {
			return nil, err
		}
		item.UserPublicID = userPublicID
		item.AccountPublicID = accountPublicID
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *AdminRepo) listUserSummaries(ctx context.Context, filter admin.UserListFilter, publicID *uuid.UUID) ([]admin.UserSummary, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT
			u.id,
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
		  AND ($1::timestamptz IS NULL OR (u.created_at,u.id) < ($1::timestamptz,$2::bigint))
		  AND ($3::uuid IS NULL OR u.public_id = $3)
		ORDER BY u.created_at DESC, u.id DESC
		LIMIT $4`, filter.AfterCreatedAt, filter.AfterID, publicID, filter.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]admin.UserSummary, 0)
	for rows.Next() {
		var item admin.UserSummary
		if err := rows.Scan(
			&item.ID,
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

func (r *AdminRepo) SetUserStatus(ctx context.Context, actorID int64, publicID uuid.UUID, status string) (admin.UserSummary, error) {
	if actorID <= 0 || publicID == uuid.Nil {
		return admin.UserSummary{}, admin.ErrInvalidUser
	}
	if status != admin.UserStatusActive && status != admin.UserStatusDisabled {
		return admin.UserSummary{}, admin.ErrInvalidUserStatus
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return admin.UserSummary{}, err
	}
	defer tx.Rollback(ctx)

	var userID int64
	var currentStatus string
	if err := tx.QueryRow(ctx, `
		SELECT id, status
		FROM users
		WHERE public_id=$1 AND deleted_at IS NULL
		FOR UPDATE`, publicID).Scan(&userID, &currentStatus); err != nil {
		return admin.UserSummary{}, mapNoRows(err, apperr.CodeNotFound, "user not found")
	}

	if currentStatus != status {
		if _, err := tx.Exec(ctx, `UPDATE users SET status=$2, updated_at=now() WHERE id=$1`, userID, status); err != nil {
			return admin.UserSummary{}, err
		}
		if status == admin.UserStatusDisabled {
			if _, err := tx.Exec(ctx, `
				UPDATE auth_sessions
				SET revoked_at=COALESCE(revoked_at, now()), revoke_reason='user disabled'
				WHERE user_id=$1 AND revoked_at IS NULL`, userID); err != nil {
				return admin.UserSummary{}, err
			}
			if _, err := tx.Exec(ctx, `
				UPDATE auth_refresh_tokens t
				SET revoked_at=COALESCE(t.revoked_at, now())
				FROM auth_sessions s
				WHERE t.session_id=s.id AND s.user_id=$1 AND t.revoked_at IS NULL`, userID); err != nil {
				return admin.UserSummary{}, err
			}
		}
		action := "user.enable"
		if status == admin.UserStatusDisabled {
			action = "user.disable"
		}
		detail, _ := json.Marshal(map[string]any{"status": status})
		if _, err := tx.Exec(ctx, `
			INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail_json)
			VALUES ($1,$2,'user',$3,$4)`, actorID, action, publicID.String(), detail); err != nil {
			return admin.UserSummary{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return admin.UserSummary{}, err
	}
	return r.GetUserSummary(ctx, publicID)
}

func (r *AdminRepo) ListAccountSummaries(ctx context.Context, limit int) ([]admin.AccountSummary, error) {
	return r.listAccountSummaries(ctx, admin.AccountListFilter{Limit: limit}, nil)
}

func (r *AdminRepo) ListAccountSummariesPage(ctx context.Context, filter admin.AccountListFilter) ([]admin.AccountSummary, error) {
	filter.Limit++
	return r.listAccountSummaries(ctx, filter, nil)
}

func (r *AdminRepo) listAccountSummaries(ctx context.Context, filter admin.AccountListFilter, accountID *uuid.UUID) ([]admin.AccountSummary, error) {
	var accountFilter any
	if accountID != nil {
		accountFilter = *accountID
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT
			a.id,
			a.public_id,
			a.created_at,
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
				) ORDER BY c.capability, c.adapter)
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
		  AND ($2::uuid IS NULL OR a.public_id=$2)
		  AND ($3::timestamptz IS NULL OR (a.created_at,a.id) < ($3::timestamptz,$4::bigint))
		ORDER BY a.created_at DESC, a.id DESC
		LIMIT $1`, filter.Limit, accountFilter, filter.AfterCreatedAt, filter.AfterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]admin.AccountSummary, 0)
	for rows.Next() {
		var item admin.AccountSummary
		var rawCapabilities []byte
		var errorCategory, errorCode, errorSeverity *string
		var errorSourceAdapter *string
		var errorCreatedAt *time.Time
		if err := rows.Scan(
			&item.ID,
			&item.PublicID,
			&item.CreatedAt,
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
		if errorCreatedAt != nil && errorCategory != nil && errorCode != nil && errorSeverity != nil {
			item.LatestError = &admin.RecentError{
				Category: *errorCategory, Code: *errorCode, Severity: *errorSeverity,
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

func (r *AdminRepo) SetAccountPaused(ctx context.Context, actorID int64, accountID uuid.UUID, paused bool) (admin.AccountSummary, error) {
	if actorID <= 0 || accountID == uuid.Nil {
		return admin.AccountSummary{}, admin.ErrInvalidAccount
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return admin.AccountSummary{}, err
	}
	defer tx.Rollback(ctx) // safe after commit

	var internalID int64
	var riskStatus string
	var cooldownUntil *time.Time
	if err := tx.QueryRow(ctx, `
		SELECT id, risk_status, cooldown_until
		FROM douyin_accounts
		WHERE public_id=$1 AND deleted_at IS NULL
		FOR UPDATE`, accountID).Scan(&internalID, &riskStatus, &cooldownUntil); err != nil {
		return admin.AccountSummary{}, mapNoRows(err, apperr.CodeNotFound, "account not found")
	}
	if !paused && riskStatus == "cooling_down" && cooldownUntil != nil && time.Now().Before(*cooldownUntil) {
		return admin.AccountSummary{}, apperr.Conflict(apperr.CodeAccountCooldownActive, "account cooldown is still active")
	}

	if paused {
		_, err = tx.Exec(ctx, `
			UPDATE douyin_accounts
			SET paused_at=COALESCE(paused_at, now()), updated_at=now()
			WHERE id=$1`, internalID)
	} else {
		_, err = tx.Exec(ctx, `
			UPDATE douyin_accounts
			SET paused_at=NULL, updated_at=now()
			WHERE id=$1`, internalID)
	}
	if err != nil {
		return admin.AccountSummary{}, err
	}

	detail, _ := json.Marshal(map[string]any{"paused": paused})
	action := "account.resume"
	if paused {
		action = "account.pause"
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail_json)
		VALUES ($1,$2,'douyin_account',$3,$4)`, actorID, action, accountID.String(), detail); err != nil {
		return admin.AccountSummary{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return admin.AccountSummary{}, err
	}

	items, err := r.listAccountSummaries(ctx, admin.AccountListFilter{Limit: 1}, &accountID)
	if err != nil {
		return admin.AccountSummary{}, err
	}
	if len(items) == 1 {
		return items[0], nil
	}
	return admin.AccountSummary{}, apperr.NotFound(apperr.CodeNotFound, "account not found")
}

func (r *AdminRepo) ListRiskSummaries(ctx context.Context, filter admin.RiskFilter) ([]admin.RiskSummary, error) {
	return r.listRiskSummaries(ctx, filter)
}

func (r *AdminRepo) ListRiskSummariesPage(ctx context.Context, filter admin.RiskFilter) ([]admin.RiskSummary, error) {
	filter.Limit++
	return r.listRiskSummaries(ctx, filter)
}

func (r *AdminRepo) listRiskSummaries(ctx context.Context, filter admin.RiskFilter) ([]admin.RiskSummary, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT e.id, e.public_id, a.public_id, u.display_name, a.nickname,
			e.category, e.code, e.severity, e.source_adapter, e.action,
			e.cooldown_until, e.created_at
		FROM risk_events e
		JOIN douyin_accounts a ON a.id = e.account_id
		JOIN users u ON u.id = a.user_id
		WHERE ($1 = '' OR e.category = $1)
		  AND ($2 = '' OR e.severity = $2)
		  AND ($3 = '' OR e.code ILIKE '%' || $3 || '%')
		  AND ($4::timestamptz IS NULL OR (e.created_at,e.id) < ($4::timestamptz,$5::bigint))
		ORDER BY e.created_at DESC, e.id DESC
		LIMIT $6`, filter.Category, filter.Severity, filter.Code, filter.AfterCreatedAt, filter.AfterID, filter.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]admin.RiskSummary, 0)
	for rows.Next() {
		var item admin.RiskSummary
		if err := rows.Scan(
			&item.ID,
			&item.PublicID, &item.AccountPublicID, &item.OwnerDisplayName, &item.Nickname,
			&item.Category, &item.Code, &item.Severity, &item.SourceAdapter, &item.Action,
			&item.CooldownUntil, &item.CreatedAt,
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

func (r *AdminRepo) ListAuditSummaries(ctx context.Context, filter admin.AuditFilter) ([]admin.AuditSummary, error) {
	return r.listAuditSummaries(ctx, filter)
}

func (r *AdminRepo) ListAuditSummariesPage(ctx context.Context, filter admin.AuditFilter) ([]admin.AuditSummary, error) {
	filter.Limit++
	return r.listAuditSummaries(ctx, filter)
}

func (r *AdminRepo) listAuditSummaries(ctx context.Context, filter admin.AuditFilter) ([]admin.AuditSummary, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT l.id, u.display_name, l.action, l.resource_type, l.resource_id,
			(l.detail_json <> '{}'::jsonb), l.created_at
		FROM audit_logs l
		LEFT JOIN users u ON u.id = l.actor_user_id
		WHERE ($1 = '' OR l.action = $1)
		  AND ($2 = '' OR l.resource_type = $2)
		  AND ($3 = '' OR l.resource_id = $3)
		  AND ($4 = '' OR COALESCE(u.display_name, '') ILIKE '%' || $4 || '%')
		  AND ($5::timestamptz IS NULL OR (l.created_at,l.id) < ($5::timestamptz,$6::bigint))
		ORDER BY l.created_at DESC, l.id DESC
		LIMIT $7`, filter.Action, filter.ResourceType, filter.ResourceID, filter.Actor, filter.AfterCreatedAt, filter.AfterID, filter.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]admin.AuditSummary, 0)
	for rows.Next() {
		var item admin.AuditSummary
		if err := rows.Scan(
			&item.ID, &item.ActorDisplayName, &item.Action, &item.ResourceType,
			&item.ResourceID, &item.HasDetail, &item.CreatedAt,
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

func (r *AdminRepo) ListSettings(ctx context.Context) ([]admin.Setting, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT key, value_json, updated_at
		FROM site_settings
		ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]admin.Setting, 0)
	for rows.Next() {
		var item admin.Setting
		var value []byte
		if err := rows.Scan(&item.Key, &value, &item.UpdatedAt); err != nil {
			return nil, err
		}
		item.Value = append([]byte(nil), value...)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *AdminRepo) SetSetting(ctx context.Context, actorID int64, key string, value json.RawMessage) (admin.Setting, error) {
	if actorID <= 0 {
		return admin.Setting{}, admin.ErrInvalidSetting
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return admin.Setting{}, err
	}
	defer tx.Rollback(ctx)

	var item admin.Setting
	var storedValue []byte
	if err := tx.QueryRow(ctx, `
		INSERT INTO site_settings (key, value_json, updated_at)
		VALUES ($1, $2::jsonb, now())
		ON CONFLICT (key) DO UPDATE
		SET value_json=EXCLUDED.value_json, updated_at=now()
		RETURNING key, value_json, updated_at`, key, []byte(value)).Scan(&item.Key, &storedValue, &item.UpdatedAt); err != nil {
		return admin.Setting{}, err
	}
	item.Value = append([]byte(nil), storedValue...)
	detail, _ := json.Marshal(map[string]any{"key": key})
	if _, err := tx.Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail_json)
		VALUES ($1, 'site_setting.update', 'site_setting', $2, $3)`, actorID, key, detail); err != nil {
		return admin.Setting{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return admin.Setting{}, err
	}
	return item, nil
}

func (r *AdminRepo) ListAdapterHealth(ctx context.Context) ([]admin.AdapterHealthSummary, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT catalog.adapter, catalog.executable,
			h.status, h.version, h.error_code, h.failure_count,
			h.circuit_open_until, h.checked_at
		FROM (VALUES
			('browser.consumer', $1::boolean),
			('browser.creator', $2::boolean),
			('protocol.im', $3::boolean)
		) AS catalog(adapter, executable)
		LEFT JOIN adapter_health h ON h.adapter = catalog.adapter
		ORDER BY catalog.adapter`,
		r.executableAdapters["browser.consumer"],
		r.executableAdapters["browser.creator"],
		r.executableAdapters["protocol.im"])
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]admin.AdapterHealthSummary, 0, len(admin.KnownAdapters))
	for rows.Next() {
		var item admin.AdapterHealthSummary
		var rawStatus *string
		var failureCount *int
		if err := rows.Scan(
			&item.Name, &item.Executable, &rawStatus, &item.Version, &item.ErrorCode,
			&failureCount, &item.CircuitOpenUntil, &item.CheckedAt,
		); err != nil {
			return nil, err
		}
		item.Status = adapterHealthStatus(rawStatus)
		item.Enabled = item.Status != "disabled"
		if failureCount != nil {
			item.FailureCount = *failureCount
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *AdminRepo) SetAdapterEnabled(ctx context.Context, actorID int64, adapter string, enabled bool) (admin.AdapterHealthSummary, error) {
	if !admin.IsKnownAdapter(adapter) {
		return admin.AdapterHealthSummary{}, admin.ErrUnknownAdapter
	}
	if actorID <= 0 {
		return admin.AdapterHealthSummary{}, fmt.Errorf("admin: invalid actor")
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return admin.AdapterHealthSummary{}, err
	}
	defer tx.Rollback(ctx) // safe after commit

	if enabled {
		_, err = tx.Exec(ctx, `DELETE FROM adapter_health WHERE adapter=$1 AND status='disabled'`, adapter)
	} else {
		_, err = tx.Exec(ctx, `
			INSERT INTO adapter_health (adapter, status, failure_count, checked_at)
			VALUES ($1, 'disabled', 0, now())
			ON CONFLICT (adapter) DO UPDATE SET status='disabled'`, adapter)
	}
	if err != nil {
		return admin.AdapterHealthSummary{}, err
	}
	detail, _ := json.Marshal(map[string]any{"enabled": enabled})
	action := "adapter.disable"
	if enabled {
		action = "adapter.enable"
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail_json)
		VALUES ($1,$2,'adapter',$3,$4)`, actorID, action, adapter, detail)
	if err != nil {
		return admin.AdapterHealthSummary{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return admin.AdapterHealthSummary{}, err
	}

	items, err := r.ListAdapterHealth(ctx)
	if err != nil {
		return admin.AdapterHealthSummary{}, err
	}
	for _, item := range items {
		if item.Name == adapter {
			return item, nil
		}
	}
	return admin.AdapterHealthSummary{}, fmt.Errorf("admin: adapter %q disappeared after update", adapter)
}

func adapterHealthStatus(raw *string) string {
	if raw == nil || *raw == "" {
		return "unknown"
	}
	if *raw == "open" {
		return "down"
	}
	return *raw
}

const schedulerLeaderKey = "lock:scheduler:leader"

var runtimePools = []struct {
	name        string
	queue       string
	concurrency int
}{
	{name: "interactive", queue: "interactive", concurrency: 2},
	{name: "browser", queue: "browser", concurrency: 3},
	{name: "light", queue: "light", concurrency: 8},
}

func (r *AdminRepo) GetRuntimeSummary(ctx context.Context) (admin.RuntimeSummary, error) {
	var summary admin.RuntimeSummary
	summary.ObservedAt = time.Now()
	summary.BrowserSlotsLimit = 3
	summary.Pools = make([]admin.WorkerPoolSummary, 0, len(runtimePools))
	for _, pool := range runtimePools {
		summary.Pools = append(summary.Pools, admin.WorkerPoolSummary{
			Name: pool.name, Concurrency: pool.concurrency,
		})
	}
	summary.Queues = make([]admin.QueueSummary, 0, len(runtimePools))

	if r.inspector != nil {
		servers, err := r.inspector.Servers()
		if err != nil {
			return admin.RuntimeSummary{}, err
		}
		for _, server := range servers {
			poolIndex := runtimePoolIndex(server.Queues)
			if poolIndex < 0 {
				continue
			}
			pool := &summary.Pools[poolIndex]
			if !pool.Online {
				pool.Concurrency = 0
			}
			pool.Online = true
			startedAt := server.Started
			pool.StartedAt = &startedAt
			observedAt := summary.ObservedAt
			pool.LastObservedAt = &observedAt
			pool.ActiveWorkers += len(server.ActiveWorkers)
			pool.Concurrency += server.Concurrency
		}
		existingQueues, err := r.inspector.Queues()
		if err != nil {
			return admin.RuntimeSummary{}, err
		}
		existing := make(map[string]struct{}, len(existingQueues))
		for _, queue := range existingQueues {
			existing[queue] = struct{}{}
		}
		for _, runtimePool := range runtimePools {
			queueSummary := admin.QueueSummary{Name: runtimePool.queue, Pool: runtimePool.name}
			if _, ok := existing[runtimePool.queue]; ok {
				info, err := r.inspector.GetQueueInfo(runtimePool.queue)
				if err != nil {
					return admin.RuntimeSummary{}, err
				}
				queueSummary.Pending = info.Pending
				queueSummary.Active = info.Active
				queueSummary.Scheduled = info.Scheduled
				queueSummary.Retry = info.Retry
				queueSummary.Failed = info.Failed
				queueSummary.Processed = info.Processed
				queueSummary.LatencySeconds = int(info.Latency.Seconds())
				queueSummary.Paused = info.Paused
			}
			summary.Queues = append(summary.Queues, queueSummary)
		}
		for _, pool := range summary.Pools {
			if pool.Name == "browser" {
				summary.BrowserSlotsUsed = pool.ActiveWorkers
				break
			}
		}
	}

	if err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*)::int FROM jobs WHERE status IN ('running', 'waiting_user'))
			+ (SELECT COUNT(*)::int FROM send_jobs WHERE status = 'running'),
			(SELECT COUNT(*)::int FROM jobs WHERE status = 'failed' AND created_at >= now() - interval '24 hours')
			+ (SELECT COUNT(*)::int FROM send_jobs WHERE status = 'failed' AND created_at >= now() - interval '24 hours')
	`).Scan(&summary.RunningJobs, &summary.FailedJobs24h); err != nil {
		return admin.RuntimeSummary{}, err
	}

	if r.redis != nil {
		exists, err := r.redis.Exists(ctx, schedulerLeaderKey).Result()
		if err != nil {
			return admin.RuntimeSummary{}, err
		}
		summary.SchedulerOnline = exists > 0
		if summary.SchedulerOnline {
			if ttl, err := r.redis.PTTL(ctx, schedulerLeaderKey).Result(); err == nil && ttl > 0 {
				expiresAt := time.Now().Add(ttl)
				summary.SchedulerLeaderExpires = &expiresAt
			}
		}
	}
	return summary, nil
}

func (r *AdminRepo) GetOverviewSummary(ctx context.Context) (admin.OverviewSummary, error) {
	runtime, err := r.GetRuntimeSummary(ctx)
	if err != nil {
		return admin.OverviewSummary{}, err
	}

	summary := admin.OverviewSummary{
		ObservedAt:       runtime.ObservedAt,
		FailureCodes:     make([]admin.FailureCodeSummary, 0),
		AdapterSuccesses: make([]admin.AdapterSuccessSummary, 0),
	}
	for _, queue := range runtime.Queues {
		summary.QueuePending += queue.Pending
		summary.QueueActive += queue.Active
		summary.QueueRetry += queue.Retry
		if queue.LatencySeconds > summary.QueueLatencySeconds {
			summary.QueueLatencySeconds = queue.LatencySeconds
		}
	}
	for _, pool := range runtime.Pools {
		summary.WorkersTotal++
		if pool.Online {
			summary.WorkersOnline++
		}
	}

	const today = `(date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')`
	if err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL AND status = 'active'),
			(SELECT COUNT(DISTINCT s.user_id)::int
			 FROM auth_sessions s
			 JOIN users u ON u.id = s.user_id
			 WHERE u.deleted_at IS NULL
			   AND s.last_seen_at >= `+today+`),
			(SELECT COUNT(*)::int
			 FROM douyin_accounts
			 WHERE deleted_at IS NULL AND binding_status = 'bound' AND session_status = 'valid'),
			(SELECT COUNT(*) FILTER (WHERE status = 'succeeded')::int
			 FROM send_jobs WHERE created_at >= `+today+`),
			(SELECT COUNT(*) FILTER (WHERE status = 'failed')::int
			 FROM send_jobs WHERE created_at >= `+today+`),
			(SELECT COUNT(*)::int
			 FROM douyin_accounts
			 WHERE deleted_at IS NULL AND risk_status <> 'normal')
	`).Scan(
		&summary.ActiveUsers,
		&summary.DAU,
		&summary.ActiveAccounts,
		&summary.TodaySendSucceeded,
		&summary.TodaySendFailed,
		&summary.RiskAccounts,
	); err != nil {
		return admin.OverviewSummary{}, err
	}

	failureRows, err := From(ctx, r.pool).Query(ctx, `
		SELECT COALESCE(NULLIF(error_code, ''), 'UNKNOWN') AS code, COUNT(*)::int AS count
		FROM send_jobs
		WHERE status = 'failed' AND created_at >= `+today+`
		GROUP BY 1
		ORDER BY count DESC, code ASC
		LIMIT 5`)
	if err != nil {
		return admin.OverviewSummary{}, err
	}
	defer failureRows.Close()
	for failureRows.Next() {
		var item admin.FailureCodeSummary
		if err := failureRows.Scan(&item.Code, &item.Count); err != nil {
			return admin.OverviewSummary{}, err
		}
		summary.FailureCodes = append(summary.FailureCodes, item)
	}
	if err := failureRows.Err(); err != nil {
		return admin.OverviewSummary{}, err
	}

	adapterRows, err := From(ctx, r.pool).Query(ctx, `
		SELECT
			CASE
				WHEN selected_adapter LIKE 'browser.%' OR selected_adapter LIKE 'douyin.browser.%' THEN 'browser'
				WHEN selected_adapter LIKE 'protocol.%' OR selected_adapter LIKE 'douyin.protocol.%' THEN 'protocol'
				ELSE selected_adapter
			END AS adapter,
			COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
			COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
		FROM send_jobs
		WHERE created_at >= `+today+` AND status IN ('succeeded', 'failed') AND NULLIF(selected_adapter, '') IS NOT NULL
		GROUP BY 1
		ORDER BY (COUNT(*) FILTER (WHERE status = 'succeeded') + COUNT(*) FILTER (WHERE status = 'failed')) DESC, adapter ASC`)
	if err != nil {
		return admin.OverviewSummary{}, err
	}
	defer adapterRows.Close()
	for adapterRows.Next() {
		var item admin.AdapterSuccessSummary
		if err := adapterRows.Scan(&item.Name, &item.Succeeded, &item.Failed); err != nil {
			return admin.OverviewSummary{}, err
		}
		summary.AdapterSuccesses = append(summary.AdapterSuccesses, item)
	}
	if err := adapterRows.Err(); err != nil {
		return admin.OverviewSummary{}, err
	}

	return summary, nil
}

func runtimePoolIndex(queues map[string]int) int {
	for index, pool := range runtimePools {
		if _, ok := queues[pool.queue]; ok {
			return index
		}
	}
	return -1
}

var _ admin.Repository = (*AdminRepo)(nil)
var _ admin.UserPageRepository = (*AdminRepo)(nil)
var _ admin.AccountPageRepository = (*AdminRepo)(nil)
var _ admin.RiskPageRepository = (*AdminRepo)(nil)
var _ admin.AuditPageRepository = (*AdminRepo)(nil)
