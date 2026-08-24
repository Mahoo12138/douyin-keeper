package sidecar

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/redislock"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
)

// SemaphoreClient limits calls made by one worker pool through a global
// Redis-backed browser semaphore. It waits for capacity instead of returning
// a transient capacity error to the job handler, while renewing the lease for
// calls whose sidecar deadline exceeds the initial TTL.
type SemaphoreClient struct {
	inner   Client
	redis   *redis.Client
	key     string
	limit   int
	ttl     time.Duration
	poll    time.Duration
	metrics *telemetry.Metrics
}

func NewSemaphoreClient(inner Client, client *redis.Client, key string, limit int, ttl time.Duration) *SemaphoreClient {
	return &SemaphoreClient{inner: inner, redis: client, key: key, limit: limit, ttl: ttl, poll: 100 * time.Millisecond}
}

func (c *SemaphoreClient) WithMetrics(metrics *telemetry.Metrics) *SemaphoreClient {
	c.metrics = metrics
	return c
}

func (c *SemaphoreClient) Call(ctx context.Context, req Request) (*Response, error) {
	if c.inner == nil {
		return nil, errors.New("sidecar: semaphore client has no inner client")
	}
	if c.redis == nil || c.key == "" || c.limit <= 0 || c.ttl <= 0 {
		return nil, errors.New("sidecar: invalid browser semaphore configuration")
	}

	lease, err := c.acquire(ctx)
	if err != nil {
		return nil, err
	}
	c.metrics.AddGauge("browser_slots_in_use", 1)
	defer c.metrics.AddGauge("browser_slots_in_use", -1)

	callCtx, cancelCall := context.WithCancel(ctx)
	defer cancelCall()
	renewDone := make(chan struct{})
	go c.renewLease(callCtx, lease, cancelCall, renewDone)

	response, callErr := c.inner.Call(callCtx, req)
	cancelCall()
	<-renewDone

	releaseCtx, cancelRelease := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelRelease()
	_ = lease.Release(releaseCtx)
	return response, callErr
}

func (c *SemaphoreClient) acquire(ctx context.Context) (*redislock.Semaphore, error) {
	for {
		lease, err := redislock.AcquireSemaphore(ctx, c.redis, c.key, uuid.NewString(), c.limit, c.ttl)
		if err == nil {
			return lease, nil
		}
		if !errors.Is(err, redislock.ErrSemaphoreBusy) {
			return nil, err
		}

		timer := time.NewTimer(c.poll)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func (c *SemaphoreClient) renewLease(ctx context.Context, lease *redislock.Semaphore, cancel context.CancelFunc, done chan<- struct{}) {
	defer close(done)
	interval := c.ttl / 3
	if interval < 100*time.Millisecond {
		interval = 100 * time.Millisecond
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			renewCtx, cancelRenew := context.WithTimeout(context.Background(), 2*time.Second)
			err := lease.Renew(renewCtx)
			cancelRenew()
			if err != nil {
				cancel()
				return
			}
		}
	}
}

var _ Client = (*SemaphoreClient)(nil)
