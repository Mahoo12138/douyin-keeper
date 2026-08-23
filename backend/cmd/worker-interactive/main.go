// Command worker-interactive processes the interactive queue (QR / SMS
// binding) with low concurrency (docs/04 §3).
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/config"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/transport/asynqworker"
)

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

	srv := asynqqueue.NewServer(asynq.RedisClientOpt{Addr: cfg.RedisAddr}, asynqworker.ServerConfig("interactive"))
	mux := asynqworker.NewMux(postgres.NewOutboxRepo(pool), log)
	log.Info("worker-interactive starting")
	if err := asynqqueue.RunServer(srv, mux, ctx); err != nil {
		log.Error("worker exited", "err", err)
		stop()
	}
}