package asynqworker

import (
	"context"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
)

// requireAdapterAccess is the worker-side global circuit/disable gate. A
// missing health observer is kept permissive for lightweight unit wiring; a
// configured observer is authoritative and must approve the Sidecar call.
func requireAdapterAccess(ctx context.Context, health capability.HealthObserver, adapter string) error {
	if health == nil {
		return nil
	}
	allowed, err := health.Allow(ctx, adapter)
	if err != nil {
		return apperr.Wrap(apperr.CodeAdapterUnavailable, apperr.KindExternal, "adapter health is unavailable", err)
	}
	if !allowed {
		return apperr.New(apperr.CodeAdapterUnavailable, apperr.KindExternal, "adapter is disabled or circuit is open")
	}
	return nil
}

func adapterGateCode(err error) string {
	if app, ok := apperr.As(err); ok && app.Code != "" {
		return app.Code
	}
	return apperr.CodeAdapterUnavailable
}
