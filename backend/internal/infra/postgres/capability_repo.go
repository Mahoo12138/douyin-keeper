package postgres

import (
	"context"

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

var _ capability.Repository = (*CapabilityRepo)(nil)