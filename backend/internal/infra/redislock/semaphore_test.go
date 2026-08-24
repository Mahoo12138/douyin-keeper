package redislock

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func newSemaphoreRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	t.Helper()
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	return server, client
}

func TestAcquireSemaphoreEnforcesCapacityAndRelease(t *testing.T) {
	_, client := newSemaphoreRedis(t)
	ctx := context.Background()

	first, err := AcquireSemaphore(ctx, client, BrowserSemaphoreKey, "first", 1, time.Minute)
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}
	if _, err := AcquireSemaphore(ctx, client, BrowserSemaphoreKey, "second", 1, time.Minute); !errors.Is(err, ErrSemaphoreBusy) {
		t.Fatalf("second acquire error = %v, want ErrSemaphoreBusy", err)
	}
	if err := first.Release(ctx); err != nil {
		t.Fatalf("release: %v", err)
	}
	if _, err := AcquireSemaphore(ctx, client, BrowserSemaphoreKey, "second", 1, time.Minute); err != nil {
		t.Fatalf("acquire after release: %v", err)
	}
}

func TestAcquireSemaphoreReclaimsExpiredLease(t *testing.T) {
	_, client := newSemaphoreRedis(t)
	ctx := context.Background()

	if _, err := AcquireSemaphore(ctx, client, BrowserSemaphoreKey, "expired", 1, 100*time.Millisecond); err != nil {
		t.Fatalf("acquire: %v", err)
	}
	time.Sleep(120 * time.Millisecond)
	if _, err := AcquireSemaphore(ctx, client, BrowserSemaphoreKey, "next", 1, time.Minute); err != nil {
		t.Fatalf("acquire after expiry: %v", err)
	}
}

func TestSemaphoreRenewKeepsLeaseAlive(t *testing.T) {
	_, client := newSemaphoreRedis(t)
	ctx := context.Background()

	lease, err := AcquireSemaphore(ctx, client, BrowserSemaphoreKey, "renewed", 1, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	if err := lease.Renew(ctx); err != nil {
		t.Fatalf("renew: %v", err)
	}
	time.Sleep(60 * time.Millisecond)
	if _, err := AcquireSemaphore(ctx, client, BrowserSemaphoreKey, "blocked", 1, time.Minute); !errors.Is(err, ErrSemaphoreBusy) {
		t.Fatalf("acquire during renewed lease error = %v, want ErrSemaphoreBusy", err)
	}
	time.Sleep(60 * time.Millisecond)
	if _, err := AcquireSemaphore(ctx, client, BrowserSemaphoreKey, "next", 1, time.Minute); err != nil {
		t.Fatalf("acquire after renewed lease: %v", err)
	}
}
