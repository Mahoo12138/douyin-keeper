package asynqworker

import (
	"context"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
)

const workerHeartbeatInterval = 20 * time.Second

// startLeaseHeartbeat renews a worker-owned DB lease until stop is called.
// Renewal errors are deliberately not converted into retries: the caller may
// already be inside a platform operation, so the final state must be decided
// by the conditional terminal write or the scheduler reaper.
func startLeaseHeartbeat(ctx context.Context, lease time.Duration, renew func(context.Context) error) func() {
	heartbeatCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go runLeaseHeartbeat(heartbeatCtx, lease, renew, done)
	return func() {
		cancel()
		<-done
	}
}

func runLeaseHeartbeat(ctx context.Context, lease time.Duration, renew func(context.Context) error, done chan<- struct{}) {
	defer close(done)
	if renew == nil {
		return
	}
	interval := workerHeartbeatInterval
	if lease > 0 && lease/3 < interval {
		interval = lease / 3
	}
	if interval <= 0 {
		interval = time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := renew(ctx); err != nil {
				// A heartbeat failure must not turn an in-flight platform result
				// into an automatic retry. The lease/reaper boundary still decides
				// the final state, but the failure must be visible to operators.
				telemetry.L(ctx).Warn("worker lease heartbeat failed", "err", err, "lease", lease)
			}
		}
	}
}
