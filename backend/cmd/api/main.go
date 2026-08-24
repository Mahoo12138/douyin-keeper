// Command api is the composition root for the HTTP/SSE server (docs/14 §11).
// No business logic lives here: config -> infra -> services -> router -> serve.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/config"
	"github.com/mahoo12138/douyin-keeper/backend/internal/conversation"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
	"github.com/mahoo12138/douyin-keeper/backend/internal/transport/httpapi"
)

type resourceCounters struct {
	accounts *postgres.AccountRepo
	tasks    *postgres.TaskRepo
}

func (c resourceCounters) CountAccountsOccupied(ctx context.Context, userID int64) (int, error) {
	return c.accounts.CountQuotaOccupied(ctx, userID)
}
func (c resourceCounters) CountTasks(ctx context.Context, userID int64) (int, error) {
	return c.tasks.CountTasks(ctx, userID)
}

func main() {
	log := telemetry.NewLogger(slog.LevelInfo)
	slog.SetDefault(log)

	cfg := config.Load()
	if err := cfg.Require("database", "redis", "auth", "crypto", "card"); err != nil {
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

	tx := postgres.NewTxManager(pool)
	userLock := postgres.NewUserLockRepo(pool)

	// ---- repositories ----
	authUsers := postgres.NewAuthUserRepo(pool)
	authSessions := postgres.NewAuthSessionRepo(pool)
	entRepo := postgres.NewEntitlementRepo(pool)
	acctRepo := postgres.NewAccountRepo(pool)
	jobRepo := postgres.NewJobRepo(pool)
	friendRepo := postgres.NewFriendRepo(pool)
	conversationRepo := postgres.NewConversationRepo(pool)
	taskRepo := postgres.NewTaskRepo(pool)
	sendRepo := postgres.NewSendRepo(pool)
	capRepo := postgres.NewCapabilityRepo(pool)
	adminRepo := postgres.NewAdminRepo(pool, rdb)
	notificationRepo := postgres.NewNotificationRepo(pool)
	outboxRepo := postgres.NewOutboxRepo(pool)

	// ---- services ----
	authSvc := auth.NewService(authUsers, authSessions, tx, auth.NewHasher(),
		[]byte(cfg.AuthSigningKey), []byte(cfg.AuthRefreshPepper),
		cfg.AuthAccessTTL, cfg.AuthRefreshTTL, nil)

	entSvc := entitlement.NewService(entRepo, entRepo, entRepo, entRepo, userLock, tx,
		[]byte(cfg.CardCodePepperDK1)).
		WithCounters(resourceCounters{accounts: acctRepo, tasks: taskRepo}).
		WithAudit(entRepo)

	accountsSvc := account.NewService(acctRepo, tx, entSvc, userLock, jobRepo, outboxRepo)
	friendsSvc := friend.NewService(friendRepo, entSvc)
	conversationSvc := conversation.NewService(conversationRepo)
	tasksSvc := task.NewService(taskRepo, acctRepo, friendRepo, entSvc, userLock, tx)
	sendsSvc := send.NewService(sendRepo, taskRepo, entSvc, entSvc, outboxRepo, tx)
	jobsSvc := job.NewService(jobRepo)
	adminSvc := admin.NewService(adminRepo)
	notificationSvc := notification.NewService(notificationRepo)

	srv := httpapi.NewServer(authSvc, entSvc, accountsSvc, friendsSvc, conversationSvc, tasksSvc, sendsSvc, jobsSvc,
		capRepo, adminSvc, notificationSvc, []byte(cfg.AuthSigningKey), cfg.AuthRefreshTTL, pool, rdb)

	httpServer := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Info("api listening", "addr", cfg.HTTPAddr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http server", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
}

// Compile-time wiring guards: services keep domain cleanliness (docs/14 §2).
var (
	_ outbox.Outbox = (*postgres.OutboxRepo)(nil)
)
