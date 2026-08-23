package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/hibiken/asynq"

	"huohua/internal/config"
	"huohua/internal/jobs"
	"huohua/internal/license"
	"huohua/internal/queue"
	"huohua/internal/sidecar"
	"huohua/internal/store"
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
	ignoreJobControlStop()
	sidecar.MarkInstalling()
	hs := &http.Server{
		Addr:              cfg.WorkerHealthAddr,
		ReadHeaderTimeout: 5 * time.Second,
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/healthz" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			body, _ := json.Marshal(map[string]any{"status": "ok", "sidecar": sidecar.CurrentStatus().State})
			_, _ = w.Write(body)
		}),
	}
	go func() {
		slog.Info("worker health", "addr", cfg.WorkerHealthAddr, "adapter", cfg.Adapter)
		if err := hs.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("worker health", "err", err)
		}
	}()
	db, err := store.OpenMySQL(cfg)
	if err != nil {
		slog.Error("mysql", "err", err)
		os.Exit(1)
	}
	defer db.Close()
	rdb, err := store.OpenRedis(cfg)
	if err != nil {
		slog.Error("redis", "err", err)
		os.Exit(1)
	}
	defer rdb.Close()
	sidecar.ReportStatus(context.Background(), rdb)
	asynqClient := queue.NewClient(cfg)
	defer asynqClient.Close()
	srv := asynq.NewServer(queue.RedisOpt(cfg), asynq.Config{
		Concurrency: 2,
		Queues:      queue.WorkerQueues(),
	})
	mux := jobs.NewMux(jobs.Deps{Cfg: cfg, DB: db, RDB: rdb, Asynq: asynqClient})
	if err := srv.Start(mux); err != nil {
		slog.Error("asynq", "err", err)
		os.Exit(1)
	}
	slog.Info("asynq 已订阅", "queues", queue.WorkerQueueNames(), "addr", cfg.RedisAddr, "db", cfg.RedisDB)
	go func() {
		_ = queue.EnqueueTaskTick(context.Background(), asynqClient)
		tk := time.NewTicker(time.Minute)
		defer tk.Stop()
		for range tk.C {
			if err := queue.EnqueueTaskTick(context.Background(), asynqClient); err != nil {
				slog.Warn("enqueue tick", "err", err)
			}
		}
	}()
	go func() {
		if err := sidecar.EnsurePythonSidecar(cfg); err != nil {
			slog.Error("sidecar python 未就绪", "err", err)
		} else if py, node, err := sidecar.Ping(cfg); err != nil {
			if sidecar.IsPythonMissing(err) {
				slog.Error("sidecar python 未找到", "err", err)
			} else {
				slog.Warn("sidecar version", "err", err)
			}
		} else {
			slog.Info("sidecar", "python", py, "node", node, "adapter", cfg.Adapter)
		}
		sidecar.ReportStatus(context.Background(), rdb)
	}()
	go func() {
		tk := time.NewTicker(15 * time.Second)
		defer tk.Stop()
		for range tk.C {
			sidecar.ReportStatus(context.Background(), rdb)
		}
	}()
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
	<-ch
	srv.Shutdown()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = hs.Shutdown(ctx)
}
