package asynqworker

import (
	"context"
	"testing"
	"time"
)

func TestRunLeaseHeartbeatRenewsAndStops(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	renewed := make(chan struct{}, 1)
	done := make(chan struct{})
	go runLeaseHeartbeat(ctx, 30*time.Millisecond, func(context.Context) error {
		select {
		case renewed <- struct{}{}:
		default:
		}
		return nil
	}, done)

	select {
	case <-renewed:
	case <-time.After(250 * time.Millisecond):
		t.Fatal("lease heartbeat did not renew")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(250 * time.Millisecond):
		t.Fatal("lease heartbeat did not stop")
	}
}
