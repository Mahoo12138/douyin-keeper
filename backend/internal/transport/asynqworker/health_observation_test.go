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

type healthObservationStub struct {
	err error
}

func (s healthObservationStub) Allow(context.Context, string) (bool, error) { return true, nil }
func (s healthObservationStub) ObserveSuccess(context.Context, string, string, time.Time) error {
	return s.err
}
func (s healthObservationStub) ObserveFailure(context.Context, string, string, string, time.Time) error {
	return s.err
}

func TestWorkerHealthObservationReportsFailurePersistenceErrors(t *testing.T) {
	var logs bytes.Buffer
	ctx := telemetry.WithContext(context.Background(), slog.New(slog.NewTextHandler(&logs, nil)))

	observeWorkerHealthFailure(ctx, healthObservationStub{err: errors.New("health store unavailable")}, "browser.consumer", "ADAPTER_INCOMPATIBLE", time.Now)

	output := logs.String()
	if !strings.Contains(output, "worker adapter health observation failed") || !strings.Contains(output, "operation=failure") {
		t.Fatalf("unexpected failure observation log: %s", output)
	}
}

func TestWorkerHealthObservationReportsSuccessPersistenceErrors(t *testing.T) {
	var logs bytes.Buffer
	ctx := telemetry.WithContext(context.Background(), slog.New(slog.NewTextHandler(&logs, nil)))

	observeWorkerHealthSuccess(ctx, healthObservationStub{err: errors.New("health store unavailable")}, "browser.consumer", time.Now)

	output := logs.String()
	if !strings.Contains(output, "worker adapter health observation failed") || !strings.Contains(output, "operation=success") {
		t.Fatalf("unexpected success observation log: %s", output)
	}
}
