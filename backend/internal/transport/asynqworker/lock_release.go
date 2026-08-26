package asynqworker

import (
	"context"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
)

type workerLock interface {
	Release(context.Context) error
}

func releaseWorkerLock(ctx context.Context, lock workerLock, resource string) {
	if lock == nil {
		return
	}
	if err := lock.Release(context.Background()); err != nil {
		telemetry.L(ctx).Warn("worker lock release failed", "err", err, "resource", resource)
	}
}
