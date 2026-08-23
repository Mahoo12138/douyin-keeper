package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"huohua/internal/bootstrap"
	"huohua/internal/config"
	"huohua/internal/license"
	"huohua/internal/queue"
	"huohua/internal/store"
	"huohua/internal/webapi"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))
	cfg, err := config.Load()
	if err != nil {
		slog.Error("配置加载失败", "err", err)
		os.Exit(1)
	}
	st := license.Check(cfg)
	slog.Info("license", "valid", st.Valid, "reason", st.Reason)
	slog.Info("asynq redis", "addr", cfg.RedisAddr, "db", cfg.RedisDB)
	db, err := store.OpenMySQL(cfg)
	if err != nil {
		slog.Error("mysql", "err", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := store.Migrate(db); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}
	rdb, err := store.OpenRedis(cfg)
	if err != nil {
		slog.Error("redis", "err", err)
		os.Exit(1)
	}
	defer rdb.Close()
	ctx := context.Background()
	if err := bootstrap.Admin(ctx, db, cfg); err != nil {
		slog.Error("bootstrap admin", "err", err)
		os.Exit(1)
	}
	asynqClient := queue.NewClient(cfg)
	defer asynqClient.Close()
	if err := queue.EnqueuePing(ctx, asynqClient); err != nil {
		slog.Warn("enqueue ping", "err", err)
	}
	srv := webapi.New(cfg, db, rdb, asynqClient)
	go func() {
		if err := srv.ListenAndServe(); err != nil {
			slog.Error("http", "err", err)
			os.Exit(1)
		}
	}()
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
	<-ch
	shctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_ = srv.Shutdown(shctx)
}
