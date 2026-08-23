// Package asynqworker wires Asynq handlers to the outbox kinds. Real adapters
// (QR binding, session check, friend sync, browser send) land in M1/M3; in M0
// every handler ACKs after logging, keeping the queue contract exercised.
package asynqworker

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

type PayloadLoader interface {
	FetchByPublicID(ctx context.Context, publicID string) (*postgres.PendingMessage, error)
}

var outboxKinds = []string{
	asynqqueue.KindAccountBindQR,
	asynqqueue.KindAccountBindSMS,
	asynqqueue.KindSessionCheckBrowser,
	asynqqueue.KindFriendsSyncBrowser,
	asynqqueue.KindSendDispatch,
	asynqqueue.KindSendBrowser,
	asynqqueue.KindSendProtocol,
	asynqqueue.KindCapabilityProbe,
}

// NewMux registers a stub handler for every outbox kind. The handler pulls
// the payload by stable id only — never secrets (docs/14 §10).
func NewMux(loader PayloadLoader, log *slog.Logger) *asynq.ServeMux {
	mux := asynq.NewServeMux()
	for _, kind := range outboxKinds {
		kind := kind
		mux.HandleFunc(kind, func(ctx context.Context, t *asynq.Task) error {
			var env struct {
				OutboxID string `json:"outbox_id"`
			}
			_ = json.Unmarshal(t.Payload(), &env)
			// M0: no platform adapter exists yet; read the payload to prove
			// the relay works, then ACK.
			if env.OutboxID != "" {
				if m, err := loader.FetchByPublicID(ctx, env.OutboxID); err == nil && log != nil {
					log.Info("worker dispatch (stub)", "kind", kind, "outbox_id", env.OutboxID,
						"aggregate_kind_hint", string(m.Payload))
				}
			} else if log != nil {
				log.Warn("worker task without outbox_id", "type", t.Type())
			}
			return nil
		})
	}
	return mux
}

// ServerConfig maps a worker pool to its queues (docs/15 §18).
func ServerConfig(pool string) map[string]int {
	switch pool {
	case "interactive":
		return map[string]int{asynqqueue.QueueInteractive: 2}
	case "browser":
		return map[string]int{asynqqueue.QueueBrowser: 3}
	default: // light
		return map[string]int{asynqqueue.QueueLight: 8}
	}
}