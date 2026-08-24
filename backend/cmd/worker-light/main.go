// Command worker-light processes the light queue (send dispatch, protocol
// send, capability probe) at high concurrency (docs/04 §3).
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/config"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
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

	capabilityRepo := postgres.NewCapabilityRepo(pool)
	workerTx := postgres.NewTxManager(pool)
	healthService := capability.NewHealthService(capabilityRepo, capability.DefaultHealthPolicy())
	sidecarScript := cfg.PlaywrightSidecarScript
	if _, statErr := os.Stat(sidecarScript); os.IsNotExist(statErr) {
		candidate := filepath.Join("..", sidecarScript)
		if _, candidateErr := os.Stat(candidate); candidateErr == nil {
			sidecarScript = candidate
		}
	}
	sidecarClient := sidecar.NewProcessClient(cfg.PlaywrightSidecarCommand, sidecarScript)
	defer sidecarClient.Close()

	srv := asynqqueue.NewServer(asynq.RedisClientOpt{Addr: cfg.RedisAddr}, asynqworker.ServerConfig("light"))
	mux := asynqworker.NewLightMux(postgres.NewOutboxRepo(pool), asynqworker.LightMuxDeps{
		Dispatch: asynqworker.SendDispatchDeps{
			Sends: postgres.NewSendRepo(pool), Outbox: postgres.NewOutboxRepo(pool), Tx: workerTx,
		},
		Probe: asynqworker.CapabilityProbeDeps{
			Snapshots: capabilityRepo, Sidecar: sidecarClient, Tx: workerTx,
			Health: healthService, Adapter: capability.AdapterBrowserConsumer,
		},
	}, log)
	log.Info("worker-light starting")
	if err := asynqqueue.RunServer(srv, mux, ctx); err != nil {
		log.Error("worker exited", "err", err)
		stop()
	}
}
