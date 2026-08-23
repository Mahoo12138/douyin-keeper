// Package telemetry wires structured slog logging with the correlation IDs
// required by docs/14 §15. Sensitive values (Authorization, cookies, refresh
// tokens, card codes, storage_state, session ciphertext) must never be logged.
package telemetry

import (
	"context"
	"log/slog"
	"os"
)

type ctxKey struct{}

// NewLogger returns a JSON structured logger.
func NewLogger(level slog.Level) *slog.Logger {
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	return slog.New(h)
}

// WithContext attaches a request-scoped logger to ctx.
func WithContext(ctx context.Context, logger *slog.Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, logger)
}

// L returns the request-scoped logger, or the package default if none.
func L(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(ctxKey{}).(*slog.Logger); ok && l != nil {
		return l
	}
	return slog.Default()
}