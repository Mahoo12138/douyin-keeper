package asynqworker

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
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

func TestRunLeaseHeartbeatReportsRenewalErrors(t *testing.T) {
	var output bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&output, &slog.HandlerOptions{Level: slog.LevelDebug}))
	ctx, cancel := context.WithCancel(telemetry.WithContext(context.Background(), logger))
	renewed := make(chan struct{}, 1)
	done := make(chan struct{})
	wantErr := errors.New("database unavailable")
	go runLeaseHeartbeat(ctx, time.Millisecond, func(context.Context) error {
		select {
		case renewed <- struct{}{}:
		default:
		}
		cancel()
		return wantErr
	}, done)

	select {
	case <-renewed:
	case <-time.After(time.Second):
		t.Fatal("lease heartbeat did not run")
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("lease heartbeat did not stop after context cancellation")
	}
	if !strings.Contains(output.String(), "worker lease heartbeat failed") || !strings.Contains(output.String(), wantErr.Error()) {
		t.Fatalf("heartbeat failure was not logged: %q", output.String())
	}
}
