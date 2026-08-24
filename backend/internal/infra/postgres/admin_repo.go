package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
)

type AdminRepo struct {
	pool      *pgxpool.Pool
	inspector *asynq.Inspector
	redis     *redis.Client
}

func NewAdminRepo(pool *pgxpool.Pool, rdb *redis.Client) *AdminRepo {
	repo := &AdminRepo{pool: pool, redis: rdb}
	if rdb != nil {
		repo.inspector = asynq.NewInspectorFromRedisClient(rdb)
	}
	return repo
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

func (r *AdminRepo) ListAdapterHealth(ctx context.Context) ([]admin.AdapterHealthSummary, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT catalog.adapter, catalog.executable,
			h.status, h.version, h.error_code, h.failure_count,
			h.circuit_open_until, h.checked_at
		FROM (VALUES
			('browser.consumer', TRUE),
			('browser.creator', FALSE),
			('protocol.im', FALSE)
		) AS catalog(adapter, executable)
		LEFT JOIN adapter_health h ON h.adapter = catalog.adapter
		ORDER BY catalog.adapter`)
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

func runtimePoolIndex(queues map[string]int) int {
	for index, pool := range runtimePools {
		if _, ok := queues[pool.queue]; ok {
			return index
		}
	}
	return -1
}

var _ admin.Repository = (*AdminRepo)(nil)
