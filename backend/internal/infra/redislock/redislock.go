// Package redislock implements the account-level mutex (docs/04 §4, docs/15 §8)
// with owner-token compare-and-delete semantics. It is used around every
// platform-mutating operation (login, friend sync, send).
package redislock

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	ErrNotHeld   = errors.New("redislock: lock not held by owner")
	ErrBusy      = errors.New("redislock: lock is already held")
	ErrUnavail   = errors.New("redislock: store unavailable")
)

const releaseScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`

const renewScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`

type Lock struct {
	client  *redis.Client
	key     string
	owner   string
	ttl     time.Duration
	held    bool
}

func Acquire(ctx context.Context, client *redis.Client, key, owner string, ttl time.Duration) (*Lock, error) {
	ok, err := client.SetNX(ctx, key, owner, ttl).Result()
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavail, err)
	}
	if !ok {
		return nil, ErrBusy
	}
	return &Lock{client: client, key: key, owner: owner, ttl: ttl, held: true}, nil
}

// Renew extends the TTL, only when still owned.
func (l *Lock) Renew(ctx context.Context) error {
	if !l.held {
		return ErrNotHeld
	}
	n, err := l.client.Eval(ctx, renewScript, []string{l.key}, l.owner, l.ttl.Milliseconds()).Int()
	if err != nil {
		return err
	}
	if n == 0 {
		l.held = false
		return ErrNotHeld
	}
	return nil
}

// Release compares the owner and deletes. Never force-delete without the
// owner token (docs/15 §8 "禁止无条件 DEL").
func (l *Lock) Release(ctx context.Context) error {
	if !l.held {
		return nil
	}
	n, err := l.client.Eval(ctx, releaseScript, []string{l.key}, l.owner).Int()
	l.held = false
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotHeld
	}
	return nil
}