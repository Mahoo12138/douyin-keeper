package asynqworker

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
)

type workerLockStub struct {
	err error
}

func (s workerLockStub) Release(context.Context) error { return s.err }

func TestReleaseWorkerLockReportsReleaseErrors(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))
	ctx := telemetry.WithContext(context.Background(), logger)

	releaseWorkerLock(ctx, workerLockStub{err: errors.New("redis unavailable")}, "account")

	output := logs.String()
	if !strings.Contains(output, "worker lock release failed") || !strings.Contains(output, "resource=account") {
		t.Fatalf("unexpected log output: %s", output)
	}
}
