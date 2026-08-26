package asynqworker

import (
	"context"
	"fmt"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
)

func cleanupWorkerResource(ctx context.Context, resource string, cleanup func() error) {
	if cleanup == nil {
		return
	}
	if err := cleanup(); err != nil {
		// Resource identifiers are intentionally coarse: paths and verification
		// keys may reveal deployment details or authentication state.
		telemetry.L(ctx).Warn("worker resource cleanup failed", "resource", resource, "error_type", fmt.Sprintf("%T", err))
	}
}
