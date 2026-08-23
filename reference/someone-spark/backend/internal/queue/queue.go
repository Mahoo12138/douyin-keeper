package queue

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/hibiken/asynq"

	"huohua/internal/config"
)

const TypePing = "health:ping"

type PingPayload struct {
	At int64 `json:"at"`
}

func RedisOpt(cfg *config.Config) asynq.RedisClientOpt {
	return asynq.RedisClientOpt{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	}
}

func NewClient(cfg *config.Config) *asynq.Client {
	return asynq.NewClient(RedisOpt(cfg))
}

func EnqueuePing(ctx context.Context, c *asynq.Client) error {
	b, _ := json.Marshal(PingPayload{At: time.Now().Unix()})
	task := asynq.NewTask(TypePing, b, asynq.MaxRetry(1), asynq.Timeout(10*time.Second))
	_, err := c.EnqueueContext(ctx, task, asynq.Queue(QueueDefault))
	return err
}

func NewMux() *asynq.ServeMux {
	mux := asynq.NewServeMux()
	mux.HandleFunc(TypePing, handlePing)
	return mux
}

func handlePing(ctx context.Context, t *asynq.Task) error {
	var p PingPayload
	_ = json.Unmarshal(t.Payload(), &p)
	slog.Info("asynq ping", "at", p.At)
	return nil
}
