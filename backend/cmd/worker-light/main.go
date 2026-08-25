// Command worker-light processes the light queue (send dispatch, protocol
// send, capability probe) at high concurrency (docs/04 §3).
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/config"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/cryptox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	wechatinfra "github.com/mahoo12138/douyin-keeper/backend/internal/infra/wechat"
	"github.com/mahoo12138/douyin-keeper/backend/internal/risk"
	"github.com/mahoo12138/douyin-keeper/backend/internal/session"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
	"github.com/mahoo12138/douyin-keeper/backend/internal/transport/asynqworker"
)

func main() {
	log := telemetry.NewLogger(slog.LevelInfo)
	slog.SetDefault(log)

	cfg := config.Load()
	if err := cfg.Require("database", "redis", "crypto"); err != nil {
		log.Error("invalid config", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	metrics := telemetry.NewMetrics()
	telemetry.StartMetricsServer(ctx, cfg.MetricsAddr, metrics, log)

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

	capabilityRepo := postgres.NewCapabilityRepo(pool)
	accountRepo := postgres.NewAccountRepo(pool)
	friendRepo := postgres.NewFriendRepo(pool)
	conversationRepo := postgres.NewConversationRepo(pool)
	taskRepo := postgres.NewTaskRepo(pool)
	sendRepo := postgres.NewSendRepo(pool)
	outboxRepo := postgres.NewOutboxRepo(pool)
	notificationRepo := postgres.NewNotificationRepo(pool)
	workerTx := postgres.NewTxManager(pool)
	healthService := capability.NewHealthService(capabilityRepo, capability.DefaultHealthPolicy()).WithMetrics(metrics)
	riskService := risk.NewService(postgres.NewRiskRepo(pool), accountRepo, workerTx, risk.DefaultCooldown).WithNotifier(notificationRepo).WithMetrics(metrics)
	entitlementRepo := postgres.NewEntitlementRepo(pool)
	entitlementSvc := entitlement.NewService(entitlementRepo, entitlementRepo, entitlementRepo, entitlementRepo,
		postgres.NewUserLockRepo(pool), workerTx, nil)
	cipher, err := cryptox.NewCipherFromHexKey(cfg.SessionMasterKey)
	if err != nil {
		log.Error("invalid session master key", "err", err)
		os.Exit(1)
	}
	sessionSvc := session.NewService(postgres.NewSessionRepo(pool), workerTx, cipher, cfg.SessionTempDir)
	if _, err := sessionSvc.CleanupStaleTempFiles(session.DefaultTempFileMaxAge); err != nil {
		log.Error("session temp cleanup failed", "err", err)
		os.Exit(1)
	}
	sidecarScript := cfg.PlaywrightSidecarScript
	if _, statErr := os.Stat(sidecarScript); os.IsNotExist(statErr) {
		candidate := filepath.Join("..", sidecarScript)
		if _, candidateErr := os.Stat(candidate); candidateErr == nil {
			sidecarScript = candidate
		}
	}
	browserSidecarClient := sidecar.NewProcessClient(cfg.PlaywrightSidecarCommand, sidecarScript)
	defer browserSidecarClient.Close()
	var protocolClient sidecar.Client = sidecar.NewUnavailableClient(capability.AdapterProtocolIM,
		"protocol SDK is not configured in this worker image")
	var protocolProcessClient *sidecar.ProcessClient
	if bundleDir := strings.TrimSpace(cfg.ProtocolBundleDir); bundleDir != "" {
		manifest, verifyErr := sidecar.VerifyBundle(bundleDir, capability.AdapterProtocolIM)
		if verifyErr != nil {
			log.Warn("protocol sidecar bundle rejected", "err", verifyErr)
			protocolClient = sidecar.NewUnavailableClientWithCode(capability.AdapterProtocolIM,
				sidecar.ErrAdapterIncompatible, "protocol sidecar bundle is incompatible")
		} else {
			// The manifest path is resolved relative to the fixed bundle working
			// directory; passing it as a relative command prevents double-prefixing
			// when PROTOCOL_SIDECAR_BUNDLE_DIR itself is relative.
			protocolProcessClient = sidecar.NewProcessClientInDir(cfg.ProtocolSidecarCommand, bundleDir, manifest.Entrypoint)
			protocolClient = protocolProcessClient
			log.Info("protocol sidecar bundle accepted", "adapter", manifest.Adapter,
				"version", manifest.AdapterVersion, "entrypoint", manifest.Entrypoint)
		}
	}
	if protocolProcessClient != nil {
		defer protocolProcessClient.Close()
	}
	executableAdapters := []string{capability.AdapterBrowserConsumer}
	if protocolProcessClient != nil {
		executableAdapters = append(executableAdapters, capability.AdapterProtocolIM)
	}
	resolver := capability.NewResolver(capabilityRepo, healthService, executableAdapters...)
	protocolWorkerID, _ := os.Hostname()
	if protocolWorkerID == "" {
		protocolWorkerID = "worker-light"
	}
	protocolWorkerID += ":" + time.Now().Format("20060102150405")
	protocolDeps := &asynqworker.SessionCheckDeps{
		Accounts: accountRepo, Sessions: sessionSvc, Sidecar: protocolClient, Redis: rdb,
		Friends: friendRepo, Conversations: conversationRepo, Targets: friendRepo, Tasks: taskRepo, Sends: sendRepo, Capabilities: capabilityRepo,
		Outbox: outboxRepo,
		Health: healthService, Risk: riskService, Entitlement: entitlementSvc, Quota: entitlementSvc,
		Tx: workerTx, WorkerID: protocolWorkerID, LockTTL: 2 * time.Minute, Metrics: metrics,
	}
	var wechatSender *wechatinfra.Client
	if cfg.WechatAppID != "" && cfg.WechatAppSecret != "" {
		wechatSender = wechatinfra.NewClient(cfg.WechatAppID, cfg.WechatAppSecret, nil)
	}

	srv := asynqqueue.NewServer(asynq.RedisClientOpt{Addr: cfg.RedisAddr}, asynqworker.ServerConfig("light"))
	mux := asynqworker.NewLightMux(outboxRepo, asynqworker.LightMuxDeps{Metrics: metrics,
		Dispatch: asynqworker.SendDispatchDeps{
			Sends: sendRepo, Outbox: outboxRepo, Tx: workerTx,
			Tasks: postgres.NewTaskRepo(pool), Resolver: resolver,
			Friends: postgres.NewFriendRepo(pool),
		},
		Probe: asynqworker.CapabilityProbeDeps{
			Snapshots: capabilityRepo, Sidecar: browserSidecarClient, Tx: workerTx,
			Health: healthService, Adapter: capability.AdapterBrowserConsumer,
			Sidecars: []asynqworker.AdapterSidecar{
				{Adapter: capability.AdapterBrowserConsumer, Client: browserSidecarClient},
				{Adapter: capability.AdapterProtocolIM, Client: protocolClient},
			},
			Metrics: metrics,
		},
		Wechat: asynqworker.WechatNotificationDeps{
			Deliveries: notificationRepo, Sender: wechatSender,
			TemplateID: cfg.WechatNotificationTemplateID, Page: cfg.WechatNotificationPage,
			TitleField: cfg.WechatNotificationTitleField, BodyField: cfg.WechatNotificationBodyField,
			Metrics: metrics,
		},
		Protocol: protocolDeps,
	}, log)
	log.Info("worker-light starting")
	if err := asynqqueue.RunServer(srv, mux, ctx); err != nil {
		log.Error("worker exited", "err", err)
		stop()
	}
}
