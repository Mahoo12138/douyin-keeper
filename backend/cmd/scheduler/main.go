// Command scheduler holds the leader lease and runs the outbox publisher plus
// the periodic reconciler ticks (docs/14 §12, docs/15 §20). It never executes
// platform operations itself.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/config"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/redislock"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/scheduler"
)

const leaderKey = "lock:scheduler:leader"

func main() {
	log := telemetry.NewLogger(slog.LevelInfo)
	slog.SetDefault(log)

	cfg := config.Load()
	if err := cfg.Require("database", "redis"); err != nil {
		log.Error("invalid config", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := postgres.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("postgres connect", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Error("redis ping", "err", err)
		os.Exit(1)
	}
	defer rdb.Close()

	// Leader election (docs/15 §19). A single instance is still safe.
	var lock *redislock.Lock
	for {
		l, err := redislock.Acquire(ctx, rdb, leaderKey, os.Getenv("HOSTNAME")+time.Now().String(), 25*time.Second)
		if err == nil {
			lock = l
			break
		}
		log.Info("waiting for scheduler leadership")
		if !sleepCtx(ctx, 5*time.Second) {
			return
		}
	}
	defer lock.Release(ctx)

	outboxRepo := postgres.NewOutboxRepo(pool)
	producer := asynqqueue.NewClient(asynq.RedisClientOpt{Addr: cfg.RedisAddr})
	defer producer.Close()
	tx := postgres.NewTxManager(pool)
	planRepo := postgres.NewEntitlementRepo(pool)
	entitlementSvc := entitlement.NewService(planRepo, planRepo, planRepo, planRepo,
		postgres.NewUserLockRepo(pool), tx, nil)
	taskRepo := postgres.NewTaskRepo(pool)
	sendRepo := postgres.NewSendRepo(pool)
	tick := scheduler.NewTickRunner(taskRepo, sendRepo, entitlementSvc, entitlementSvc,
		outboxRepo, tx, cfg.ScheduleBatchSize)
	sendReaper := scheduler.NewSendLeaseReaper(sendRepo, entitlementSvc, tx, cfg.ScheduleBatchSize)
	retryRunner := scheduler.NewRetryRunner(sendRepo, entitlementSvc, outboxRepo, tx, cfg.ScheduleBatchSize)

	publisher := scheduler.NewPublisher(outboxRepo, producer, cfg.OutboxBatchSize,
		cfg.OutboxPollInterval, log)

	// Leader renewal in the background.
	go func() {
		t := time.NewTicker(20 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if err := lock.Renew(ctx); err != nil {
					log.Error("leader renewal failed", "err", err)
				}
			}
		}
	}()

	go func() {
		t := time.NewTicker(cfg.ScheduleInterval)
		defer t.Stop()
		for {
			if stats, err := tick.RunOnce(ctx); err != nil {
				log.Error("scheduler tick failed", "err", err)
			} else if stats.Created > 0 || stats.Skipped > 0 {
				log.Info("scheduler tick completed", "scanned", stats.Scanned,
					"created", stats.Created, "skipped", stats.Skipped)
			}
			select {
			case <-ctx.Done():
				return
			case <-t.C:
			}
		}
	}()

	go func() {
		t := time.NewTicker(60 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				// Reconciler: return expired publish locks to pending (docs/15 §20).
				if n, err := outboxRepo.ReconcileExpiredLocks(ctx); err == nil && n > 0 {
					log.Info("outbox expired locks reconciled", "count", n)
				}
				if n, err := sendReaper.RunOnce(ctx); err != nil {
					log.Error("send lease reaper failed", "err", err)
				} else if n > 0 {
					log.Warn("send attempts failed closed after expired lease", "count", n,
						"error_code", apperr.CodeOutcomeUnknown)
				}
				if stats, err := retryRunner.RunOnce(ctx); err != nil {
					log.Error("send retry scan failed", "err", err)
				} else if stats.Requeued > 0 || stats.Exhausted > 0 {
					log.Info("send retry scan completed", "scanned", stats.Scanned,
						"requeued", stats.Requeued, "exhausted", stats.Exhausted)
				}
			}
		}
	}()

	log.Info("scheduler leading; publisher running")
	if err := publisher.Run(ctx); err != nil {
		log.Error("publisher stopped", "err", err)
	}
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}
