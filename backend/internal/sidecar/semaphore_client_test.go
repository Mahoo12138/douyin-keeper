package sidecar

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/redislock"
)

type semaphoreTestClient struct {
	active int32
	max    int32
}

func (c *semaphoreTestClient) Call(ctx context.Context, req Request) (*Response, error) {
	_ = req
	active := atomic.AddInt32(&c.active, 1)
	for {
		max := atomic.LoadInt32(&c.max)
		if active <= max || atomic.CompareAndSwapInt32(&c.max, max, active) {
			break
		}
	}
	defer atomic.AddInt32(&c.active, -1)
	select {
	case <-time.After(50 * time.Millisecond):
		return &Response{ProtocolVersion: ProtocolVersion, OK: true}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func TestSemaphoreClientSerializesCallsAcrossWorkers(t *testing.T) {
	server := miniredis.RunT(t)
	redisClient := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = redisClient.Close() })

	underlying := &semaphoreTestClient{}
	client := NewSemaphoreClient(underlying, redisClient, redislock.BrowserSemaphoreKey, 1, time.Second)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := client.Call(ctx, Request{RequestID: "test", Op: OpsHealthCheck}); err != nil {
				t.Errorf("call: %v", err)
			}
		}()
	}
	wg.Wait()
	if got := atomic.LoadInt32(&underlying.max); got != 1 {
		t.Fatalf("maximum concurrent sidecar calls = %d, want 1", got)
	}
}
