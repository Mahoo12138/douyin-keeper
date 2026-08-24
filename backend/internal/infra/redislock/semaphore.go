package redislock

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	ErrSemaphoreNotHeld = errors.New("redislock: semaphore lease not held by owner")
	ErrSemaphoreBusy    = errors.New("redislock: semaphore is at capacity")
	ErrSemaphoreUnavail = errors.New("redislock: semaphore store unavailable")
)

const (
	BrowserSemaphoreKey = "semaphore:browser"
)

const semaphoreAcquireScript = `
local t = redis.call("time")
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call("zremrangebyscore", KEYS[1], "-inf", now)
if redis.call("zcard", KEYS[1]) >= tonumber(ARGV[1]) then
  return 0
end
redis.call("zadd", KEYS[1], now + tonumber(ARGV[2]), ARGV[3])
return 1
`

const semaphoreRenewScript = `
local t = redis.call("time")
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local score = redis.call("zscore", KEYS[1], ARGV[1])
if not score or tonumber(score) <= now then
  redis.call("zrem", KEYS[1], ARGV[1])
  return 0
end
redis.call("zadd", KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
return 1
`

type Semaphore struct {
	client *redis.Client
	key    string
	owner  string
	ttl    time.Duration

	mu   sync.Mutex
	held bool
}

// AcquireSemaphore reserves one expiring slot in a Redis-backed global
// semaphore. Sorted-set scores are lease expiry timestamps; the Lua script
// makes cleanup, capacity checking, and acquisition atomic across workers.
func AcquireSemaphore(ctx context.Context, client *redis.Client, key, owner string, limit int, ttl time.Duration) (*Semaphore, error) {
	if client == nil {
		return nil, ErrSemaphoreUnavail
	}
	if key == "" || owner == "" || limit <= 0 || ttl <= 0 {
		return nil, fmt.Errorf("%w: invalid semaphore parameters", ErrSemaphoreUnavail)
	}

	n, err := client.Eval(ctx, semaphoreAcquireScript, []string{key}, limit, ttl.Milliseconds(), owner).Int()
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSemaphoreUnavail, err)
	}
	if n == 0 {
		return nil, ErrSemaphoreBusy
	}
	return &Semaphore{client: client, key: key, owner: owner, ttl: ttl, held: true}, nil
}

// Renew extends the lease only while the owner is still present and unexpired.
func (s *Semaphore) Renew(ctx context.Context) error {
	s.mu.Lock()
	held := s.held
	s.mu.Unlock()
	if !held {
		return ErrSemaphoreNotHeld
	}

	n, err := s.client.Eval(ctx, semaphoreRenewScript, []string{s.key}, s.owner, s.ttl.Milliseconds()).Int()
	if err != nil {
		return fmt.Errorf("%w: %v", ErrSemaphoreUnavail, err)
	}
	if n == 0 {
		s.mu.Lock()
		s.held = false
		s.mu.Unlock()
		return ErrSemaphoreNotHeld
	}
	return nil
}

// Release removes only this owner's slot. Expiry still guarantees eventual
// recovery if a worker terminates before it can release the lease.
func (s *Semaphore) Release(ctx context.Context) error {
	s.mu.Lock()
	if !s.held {
		s.mu.Unlock()
		return nil
	}
	s.held = false
	s.mu.Unlock()

	n, err := s.client.ZRem(ctx, s.key, s.owner).Result()
	if err != nil {
		return fmt.Errorf("%w: %v", ErrSemaphoreUnavail, err)
	}
	if n == 0 {
		return ErrSemaphoreNotHeld
	}
	return nil
}
