package asynqworker

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

type qrCancelFailureStub struct{}

func (qrCancelFailureStub) Call(context.Context, sidecar.Request) (*sidecar.Response, error) {
	return nil, errors.New("sidecar unavailable")
}

func TestCancelQRSessionReportsSidecarErrors(t *testing.T) {
	var logs bytes.Buffer
	ctx := telemetry.WithContext(context.Background(), slog.New(slog.NewTextHandler(&logs, nil)))

	cancelQRSession(ctx, qrCancelFailureStub{}, "qr-handle")

	if !strings.Contains(logs.String(), "QR session cancellation failed") {
		t.Fatalf("cancel failure was not logged: %s", logs.String())
	}
}
