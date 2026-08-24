package postgres

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/risk"
)

type RiskRepo struct {
	pool *pgxpool.Pool
}

func NewRiskRepo(pool *pgxpool.Pool) *RiskRepo { return &RiskRepo{pool: pool} }

func (r *RiskRepo) Record(ctx context.Context, e *risk.Event) error {
	e.PublicID = uuid.New()
	var b []byte
	if e.Detail != nil {
		b, _ = json.Marshal(e.Detail)
	}
	if len(b) == 0 {
		b = []byte("{}")
	}
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO risk_events (public_id, account_id, category, code, severity, source_adapter, detail_json, action, cooldown_until)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id
	`, e.PublicID, e.AccountID, e.Category, e.Code, e.Severity, e.SourceAdapter, b, e.Action, e.CooldownUntil).Scan(&e.ID)
}

func (r *RiskRepo) ListByAccount(ctx context.Context, accountID int64, limit int) ([]*risk.Event, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT id, public_id, account_id, category, code, severity, source_adapter, detail_json, action, cooldown_until, created_at
		FROM risk_events WHERE account_id=$1 ORDER BY id DESC LIMIT $2`, accountID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*risk.Event
	for rows.Next() {
		var e risk.Event
		var b []byte
		if err := rows.Scan(&e.ID, &e.PublicID, &e.AccountID, &e.Category, &e.Code, &e.Severity,
			&e.SourceAdapter, &b, &e.Action, &e.CooldownUntil, &e.CreatedAt); err != nil {
			return nil, err
		}
		if len(b) > 0 {
			_ = json.Unmarshal(b, &e.Detail)
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}

var _ risk.Repository = (*RiskRepo)(nil)
