package postgres

import (
	"context"

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

var _ capability.Repository = (*CapabilityRepo)(nil)
