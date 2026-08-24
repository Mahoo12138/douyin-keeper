// Package scheduler owns the outbox publisher and the task tick. It runs as
// cmd/scheduler (leader) and never executes platform ops itself (docs/14 §12).
package scheduler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
)

// Publisher drains queue_outbox into Asynq using SKIP LOCKED claims
// (docs/15 §2.2). It can run concurrently on multiple instances; PostgreSQL
// sharding keeps them safe.
type Publisher struct {
	outbox     publisherOutbox
	producer   publisherProducer
	batchSize  int
	interval   time.Duration
	instanceID string
	log        *slog.Logger
	metrics    *telemetry.Metrics
}

type publisherOutbox interface {
	ClaimPending(context.Context, int, string, time.Duration) ([]postgres.PendingMessage, error)
	MarkPublished(context.Context, int64) error
	MarkFailed(context.Context, int64, int, time.Time, string) error
}

type publisherProducer interface {
	Enqueue(context.Context, asynqqueue.Message) error
}

func (p *Publisher) WithMetrics(metrics *telemetry.Metrics) *Publisher {
	p.metrics = metrics
	return p
}

func NewPublisher(outbox publisherOutbox, producer publisherProducer,
	batchSize int, interval time.Duration, log *slog.Logger) *Publisher {
	return &Publisher{
		outbox: outbox, producer: producer, batchSize: batchSize, interval: interval,
		instanceID: "scheduler-" + uuid.NewString()[:8], log: log,
	}
}

// Run loops until ctx is cancelled.
func (p *Publisher) Run(ctx context.Context) error {
	t := time.NewTicker(p.interval)
	defer t.Stop()
	for {
		if err := p.Pump(ctx); err != nil && p.log != nil {
			p.log.Error("outbox pump failed", "err", err)
		}
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
		}
	}
}

// Pump claims one batch and relays it.
func (p *Publisher) Pump(ctx context.Context) error {
	msgs, err := p.outbox.ClaimPending(ctx, p.batchSize, p.instanceID, 2*p.interval)
	if err != nil {
		return err
	}
	for _, m := range msgs {
		if err := p.relay(ctx, m); err != nil && p.log != nil {
			p.log.Error("outbox relay failed", "outbox_public_id", m.PublicID, "err", err)
		}
	}
	return nil
}

func (p *Publisher) relay(ctx context.Context, m postgres.PendingMessage) error {
	if !m.AvailableAt.IsZero() {
		latency := time.Since(m.AvailableAt).Seconds()
		if latency < 0 {
			latency = 0
		}
		p.metrics.Observe("queue_latency_seconds", latency, telemetry.Label{Name: "type", Value: m.Kind})
	}
	payload := map[string]any{"outbox_id": m.PublicID}
	err := p.producer.Enqueue(ctx, asynqqueue.Message{
		ID: m.PublicID, Kind: m.Kind, WorkerPayload: payload,
	})
	if err != nil {
		// The Task ID is deterministic (outbox:<public_id>). If the task is
		// already present, a previous relay succeeded but likely crashed before
		// recording the outbox state. Treat the conflict as idempotent success.
		if errors.Is(err, asynq.ErrTaskIDConflict) {
			return p.outbox.MarkPublished(ctx, m.ID)
		}
		// Backoff + dead-letter after MaxOutboxAttempts (docs/15 §2.2).
		attempts := m.Attempts + 1
		backoff := time.Duration(1<<min(attempts-1, 5)) * time.Second
		_ = p.outbox.MarkFailed(ctx, m.ID, attempts, time.Now().Add(backoff), "enqueue_failed")
		return fmt.Errorf("relay %s: %w", m.Kind, err)
	}
	return p.outbox.MarkPublished(ctx, m.ID)
}
