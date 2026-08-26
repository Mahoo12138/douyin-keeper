package asynqworker

import (
	"context"
	"fmt"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

type riskApplier interface {
	Apply(context.Context, int64, string, string, map[string]any) error
}

type riskApplierInTx interface {
	ApplyInTx(context.Context, int64, string, string, map[string]any) error
}

type riskMetricsObserver interface {
	ObserveMetrics(string)
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

func applyWorkerRiskInTx(ctx context.Context, applier riskApplier, accountID int64, code, adapter, jobID string) error {
	if applier == nil {
		return nil
	}
	txApplier, ok := applier.(riskApplierInTx)
	if !ok {
		return fmt.Errorf("risk applier does not support caller transaction")
	}
	detail := map[string]any{}
	if jobID != "" {
		detail["job_id"] = jobID
	}
	return txApplier.ApplyInTx(ctx, accountID, code, adapter, detail)
}

func observeWorkerRiskMetrics(applier riskApplier, code string) {
	if applier == nil || code == "" {
		return
	}
	if observer, ok := applier.(riskMetricsObserver); ok {
		observer.ObserveMetrics(code)
	}
}

func commitWorkerFailure(
	ctx context.Context,
	tx job.TxManager,
	j job.Repository,
	applier riskApplier,
	claimed *job.Job,
	accountID int64,
	code, adapter string,
	jobID string,
	fallback func(context.Context) error,
	now func() time.Time,
	cleanup ...func(context.Context) error,
) error {
	return commitWorkerFailureWithEvents(ctx, tx, j, applier, claimed, accountID, code, adapter, jobID, fallback, nil, now, cleanup...)
}

func commitWorkerFailureWithEvents(
	ctx context.Context,
	tx job.TxManager,
	j job.Repository,
	applier riskApplier,
	claimed *job.Job,
	accountID int64,
	code, adapter string,
	jobID string,
	fallback func(context.Context) error,
	events []job.JobEvent,
	now func() time.Time,
	cleanup ...func(context.Context) error,
) error {
	err := tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := j.Finish(tctx, claimed.ID, job.StatusFailed, &code, now()); err != nil {
			return err
		}
		if applier != nil {
			if err := applyWorkerRiskInTx(tctx, applier, accountID, code, adapter, jobID); err != nil {
				return err
			}
		} else if fallback != nil {
			if err := fallback(tctx); err != nil {
				return err
			}
		}
		for _, release := range cleanup {
			if release != nil {
				if err := release(tctx); err != nil {
					return err
				}
			}
		}
		for _, event := range events {
			if err := j.AppendEvent(tctx, claimed.ID, event); err != nil {
				return err
			}
		}
		return j.AppendEvent(tctx, claimed.ID, job.JobEvent{
			EventType: "error", Payload: mustJSON(map[string]string{"code": code}), CreatedAt: now(),
		})
	})
	if err == nil {
		observeWorkerRiskMetrics(applier, code)
	}
	return err
}

func observeWorkerHealthFailure(ctx context.Context, health capability.HealthObserver, adapter, code string, now func() time.Time) {
	if health == nil || !capability.IsCircuitFailureCode(code) {
		return
	}
	if err := health.ObserveFailure(ctx, adapter, "", code, now()); err != nil {
		telemetry.L(ctx).Warn("worker adapter health observation failed", "operation", "failure", "adapter", adapter, "code", code, "err", err)
	}
}

func observeWorkerHealthSuccess(ctx context.Context, health capability.HealthObserver, adapter string, now func() time.Time) {
	if health == nil {
		return
	}
	if err := health.ObserveSuccess(ctx, adapter, "", now()); err != nil {
		telemetry.L(ctx).Warn("worker adapter health observation failed", "operation", "success", "adapter", adapter, "err", err)
	}
}
