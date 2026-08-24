package scheduler

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
)

const DefaultCapabilityProbeInterval = 10 * time.Minute

type CapabilityProbeStats struct {
	Scanned  int
	Enqueued int
}

// CapabilityProbeRunner refreshes account-scoped health snapshots through the
// transactional outbox. It never calls a Sidecar directly (docs/15 §3).
type CapabilityProbeRunner struct {
	accounts capability.ProbeRepository
	outbox   outbox.Outbox
	tx       txManager
	interval time.Duration
	limit    int
	now      func() time.Time
}

func NewCapabilityProbeRunner(accounts capability.ProbeRepository, relay outbox.Outbox, tx txManager,
	interval time.Duration, limit int) *CapabilityProbeRunner {
	if interval <= 0 {
		interval = DefaultCapabilityProbeInterval
	}
	if limit <= 0 {
		limit = 100
	}
	return &CapabilityProbeRunner{accounts: accounts, outbox: relay, tx: tx,
		interval: interval, limit: limit, now: time.Now}
}

func (r *CapabilityProbeRunner) SetNow(now func() time.Time) { r.now = now }

func (r *CapabilityProbeRunner) RunOnce(ctx context.Context) (CapabilityProbeStats, error) {
	if r.accounts == nil || r.outbox == nil || r.tx == nil {
		return CapabilityProbeStats{}, apperr.New(apperr.CodeInternal, apperr.KindInternal,
			"capability probe scheduler is not configured")
	}
	now := time.Now()
	if r.now != nil {
		now = r.now()
	}
	targets, err := r.accounts.ListStaleProbeTargets(ctx, now.Add(-r.interval), r.limit)
	if err != nil {
		return CapabilityProbeStats{}, err
	}
	stats := CapabilityProbeStats{Scanned: len(targets)}
	bucket := strconv.FormatInt(now.UTC().Truncate(r.interval).Unix(), 10)
	for _, target := range targets {
		err := r.tx.WithinTx(ctx, func(tctx context.Context) error {
			return r.outbox.Add(tctx, outbox.Message{
				Kind: outbox.KindCapabilityProbe, AggregateType: "account",
				AggregateID: target.PublicID.String(),
				Payload:     capabilityProbePayload(target.AccountID),
				AvailableAt: now,
				DedupeKey:   "capability.probe.periodic:" + target.PublicID.String() + ":" + bucket,
			})
		})
		if err != nil {
			return stats, err
		}
		stats.Enqueued++
	}
	return stats, nil
}

func capabilityProbePayload(accountID int64) []byte {
	payload, _ := json.Marshal(map[string]int64{"account_id": accountID})
	return payload
}
