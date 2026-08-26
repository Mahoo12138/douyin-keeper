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

func TestCleanupWorkerResourceReportsErrorsWithoutLeakingResourceDetails(t *testing.T) {
	var logs bytes.Buffer
	ctx := telemetry.WithContext(context.Background(), slog.New(slog.NewTextHandler(&logs, nil)))

	cleanupWorkerResource(ctx, "login_profile", func() error { return errors.New("remove failed: /tmp/secret-profile") })

	output := logs.String()
	if !strings.Contains(output, "worker resource cleanup failed") || !strings.Contains(output, "resource=login_profile") {
		t.Fatalf("unexpected cleanup log: %s", output)
	}
	if strings.Contains(output, "/tmp/secret-profile") {
		t.Fatalf("cleanup log leaked resource detail: %s", output)
	}
}
