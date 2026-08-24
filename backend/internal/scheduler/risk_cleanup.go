package scheduler

import (
	"context"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

type riskCooldownStore interface {
	ClearExpiredRiskCooldowns(ctx context.Context, now time.Time, limit int) (int, error)
}

type RiskCooldownReaper struct {
	store riskCooldownStore
	limit int
	now   func() time.Time
}

func NewRiskCooldownReaper(store riskCooldownStore, limit int) *RiskCooldownReaper {
	if limit <= 0 {
		limit = 100
	}
	return &RiskCooldownReaper{store: store, limit: limit, now: time.Now}
}

func (r *RiskCooldownReaper) SetNow(now func() time.Time) { r.now = now }

func (r *RiskCooldownReaper) RunOnce(ctx context.Context) (int, error) {
	if r.store == nil {
		return 0, apperr.New(apperr.CodeInternal, apperr.KindInternal,
			"risk cooldown reaper is not configured")
	}
	now := time.Now()
	if r.now != nil {
		now = r.now()
	}
	return r.store.ClearExpiredRiskCooldowns(ctx, now, r.limit)
}
