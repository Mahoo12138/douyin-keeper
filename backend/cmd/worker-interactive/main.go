// Command worker-interactive processes the interactive queue (QR / SMS
// binding) with low concurrency (docs/04 §3).
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/config"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/cryptox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/risk"
	"github.com/mahoo12138/douyin-keeper/backend/internal/session"
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
	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Error("redis ping", "err", err)
		os.Exit(1)
	}
	defer rdb.Close()
	cipher, err := cryptox.NewCipherFromHexKey(cfg.SessionMasterKey)
	if err != nil {
		log.Error("invalid session master key", "err", err)
		os.Exit(1)
	}
	jobRepo := postgres.NewJobRepo(pool)
	accountRepo := postgres.NewAccountRepo(pool)
	workerTx := postgres.NewTxManager(pool)
	healthService := capability.NewHealthService(postgres.NewCapabilityRepo(pool), capability.DefaultHealthPolicy())
	riskService := risk.NewService(postgres.NewRiskRepo(pool), accountRepo, workerTx, risk.DefaultCooldown)
	sessionSvc := session.NewService(postgres.NewSessionRepo(pool), workerTx, cipher, cfg.SessionTempDir)
	sidecarScript := cfg.PlaywrightSidecarScript
	if _, statErr := os.Stat(sidecarScript); os.IsNotExist(statErr) {
		candidate := filepath.Join("..", sidecarScript)
		if _, candidateErr := os.Stat(candidate); candidateErr == nil {
			sidecarScript = candidate
		}
	}
	sidecarClient := sidecar.NewProcessClient(cfg.PlaywrightSidecarCommand, sidecarScript)
	defer sidecarClient.Close()
	workerID, _ := os.Hostname()
	if workerID == "" {
		workerID = "worker-interactive"
	}
	workerID += ":" + time.Now().Format("20060102150405")

	srv := asynqqueue.NewServer(asynq.RedisClientOpt{Addr: cfg.RedisAddr}, asynqworker.ServerConfig("interactive"))
	mux := asynqworker.NewInteractiveMux(postgres.NewOutboxRepo(pool), asynqworker.QRBindDeps{
		Jobs: jobRepo, Accounts: accountRepo, Sessions: sessionSvc, Sidecar: sidecarClient,
		Redis: rdb, Tx: workerTx, Outbox: postgres.NewOutboxRepo(pool), Health: healthService, Risk: riskService,
		WorkerID: workerID, ProfileRoot: cfg.LoginProfileDir, LockTTL: 6 * time.Minute,
	}, log)
	log.Info("worker-interactive starting")
	if err := asynqqueue.RunServer(srv, mux, ctx); err != nil {
		log.Error("worker exited", "err", err)
		stop()
	}
}
