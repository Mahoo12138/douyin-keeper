package asynqworker

import (
	"context"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
)

type riskApplier interface {
	Apply(context.Context, int64, string, string, map[string]any) error
}

func observeWorkerRisk(ctx context.Context, applier riskApplier, accountID int64, code, adapter string, jobID string) {
	if applier == nil {
		return
	}
	detail := map[string]any{}
	if jobID != "" {
		detail["job_id"] = jobID
	}
	_ = applier.Apply(ctx, accountID, code, adapter, detail)
}

func observeWorkerHealthFailure(ctx context.Context, health capability.HealthObserver, adapter, code string, now func() time.Time) {
	if health == nil || !capability.IsCircuitFailureCode(code) {
		return
	}
	_ = health.ObserveFailure(ctx, adapter, "", code, now())
}
