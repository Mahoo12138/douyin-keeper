package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
)

type CapabilityRepo struct {
	pool *pgxpool.Pool
}

func NewCapabilityRepo(pool *pgxpool.Pool) *CapabilityRepo { return &CapabilityRepo{pool: pool} }

func (r *CapabilityRepo) ListByAccount(ctx context.Context, accountID int64) ([]capability.Capability, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT account_id, capability, status, adapter, error_code, checked_at
		FROM capability_snapshots WHERE account_id=$1 ORDER BY capability`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []capability.Capability
	for rows.Next() {
		var c capability.Capability
		if err := rows.Scan(&c.AccountID, &c.Name, &c.Status, &c.Adapter, &c.ErrorCode, &c.CheckedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *CapabilityRepo) GetByAccountAndName(ctx context.Context, accountID int64, name string) (*capability.Capability, error) {
	var c capability.Capability
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT account_id, capability, status, adapter, error_code, checked_at
		FROM capability_snapshots WHERE account_id=$1 AND capability=$2`, accountID, name).
		Scan(&c.AccountID, &c.Name, &c.Status, &c.Adapter, &c.ErrorCode, &c.CheckedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *CapabilityRepo) Upsert(ctx context.Context, c capability.Capability) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		INSERT INTO capability_snapshots (account_id, capability, status, adapter, error_code, checked_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (account_id, capability) DO UPDATE SET
			status=EXCLUDED.status, adapter=EXCLUDED.adapter, error_code=EXCLUDED.error_code,
			checked_at=EXCLUDED.checked_at`,
		c.AccountID, c.Name, c.Status, c.Adapter, c.ErrorCode, c.CheckedAt)
	return err
}

func (r *CapabilityRepo) ListStaleProbeTargets(ctx context.Context, before time.Time, limit int) ([]capability.ProbeTarget, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT a.id, a.public_id
		FROM douyin_accounts a
		LEFT JOIN capability_snapshots c
		  ON c.account_id = a.id AND c.capability = $1
		WHERE a.binding_status = 'bound' AND a.deleted_at IS NULL
		  AND (c.checked_at IS NULL OR c.checked_at <= $2)
		  AND NOT EXISTS (
			SELECT 1 FROM queue_outbox o
			WHERE o.kind = 'capability.probe'
			  AND o.aggregate_type = 'account'
			  AND o.aggregate_id = a.public_id::text
			  AND (o.status IN ('pending', 'publishing')
			       OR (o.status = 'published' AND o.created_at > $2))
		  )
		ORDER BY a.id
		LIMIT $3`, capability.NameMessageTextExisting, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []capability.ProbeTarget
	for rows.Next() {
		var target capability.ProbeTarget
		if err := rows.Scan(&target.AccountID, &target.PublicID); err != nil {
			return nil, err
		}
		out = append(out, target)
	}
	return out, rows.Err()
}

func (r *CapabilityRepo) GetAdapterHealth(ctx context.Context, adapter string) (*capability.AdapterHealth, error) {
	var health capability.AdapterHealth
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT adapter, status, version, error_code, failure_count, circuit_open_until, checked_at
		FROM adapter_health WHERE adapter=$1`, adapter).
		Scan(&health.Adapter, &health.Status, &health.Version, &health.ErrorCode,
			&health.FailureCount, &health.CircuitOpenUntil, &health.CheckedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &health, nil
}

func (r *CapabilityRepo) RecordAdapterSuccess(ctx context.Context, adapter, version string, checkedAt time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		INSERT INTO adapter_health (adapter, status, version, error_code, failure_count, circuit_open_until, checked_at)
		VALUES ($1, 'healthy', NULLIF($2, ''), NULL, 0, NULL, $3)
		ON CONFLICT (adapter) DO UPDATE SET
			status = CASE WHEN adapter_health.status = 'disabled' THEN 'disabled' ELSE 'healthy' END,
			version = COALESCE(NULLIF(EXCLUDED.version, ''), adapter_health.version),
			error_code = CASE WHEN adapter_health.status = 'disabled' THEN adapter_health.error_code ELSE NULL END,
			failure_count = CASE WHEN adapter_health.status = 'disabled' THEN adapter_health.failure_count ELSE 0 END,
			circuit_open_until = CASE WHEN adapter_health.status = 'disabled' THEN adapter_health.circuit_open_until ELSE NULL END,
			checked_at = EXCLUDED.checked_at
		WHERE EXCLUDED.checked_at >= adapter_health.checked_at`, adapter, version, checkedAt)
	return err
}

func (r *CapabilityRepo) RecordAdapterFailure(ctx context.Context, adapter, version, errorCode string, threshold int, openUntil, checkedAt time.Time) error {
	if threshold <= 0 {
		threshold = 1
	}
	_, err := From(ctx, r.pool).Exec(ctx, `
		INSERT INTO adapter_health (adapter, status, version, error_code, failure_count, circuit_open_until, checked_at)
		VALUES ($1,
			CASE WHEN 1 >= $4 THEN 'open' ELSE 'degraded' END,
			NULLIF($2, ''), NULLIF($3, ''), 1,
			CASE WHEN 1 >= $4 THEN $5::timestamptz ELSE NULL::timestamptz END, $6)
		ON CONFLICT (adapter) DO UPDATE SET
			status = CASE
				WHEN adapter_health.status = 'disabled' THEN 'disabled'
				WHEN adapter_health.failure_count + 1 >= $4 THEN 'open'
				ELSE 'degraded'
			END,
			version = COALESCE(NULLIF(EXCLUDED.version, ''), adapter_health.version),
			error_code = EXCLUDED.error_code,
			failure_count = CASE WHEN adapter_health.status = 'disabled' THEN adapter_health.failure_count ELSE adapter_health.failure_count + 1 END,
			circuit_open_until = CASE
				WHEN adapter_health.status = 'disabled' THEN adapter_health.circuit_open_until
				WHEN adapter_health.failure_count + 1 >= $4 THEN $5
				ELSE NULL::timestamptz
			END,
			checked_at = EXCLUDED.checked_at
		WHERE EXCLUDED.checked_at >= adapter_health.checked_at`, adapter, version, errorCode, threshold, openUntil, checkedAt)
	return err
}

var _ capability.Repository = (*CapabilityRepo)(nil)
var _ capability.ProbeRepository = (*CapabilityRepo)(nil)
var _ capability.HealthRepository = (*CapabilityRepo)(nil)
