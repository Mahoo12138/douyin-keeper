package asynqworker

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
)

func TestServerConfigUsesBrowserConcurrency(t *testing.T) {
	config := ServerConfig("browser", 5)
	if got := config[asynqqueue.QueueBrowser]; got != 5 {
		t.Fatalf("browser concurrency = %d, want 5", got)
	}
	if got := ServerConfig("browser")[asynqqueue.QueueBrowser]; got != 3 {
		t.Fatalf("default browser concurrency = %d, want 3", got)
	}
}

func TestInstrumentedHandlerRecordsJobAndSendMetrics(t *testing.T) {
	metrics := telemetry.NewMetrics()
	handler := instrumentedHandler(asynqqueue.KindSendBrowser, func(context.Context, *asynq.Task) error {
		return errors.New("adapter failed")
	}, metrics)
	if err := handler(context.Background(), asynq.NewTask(asynqqueue.KindSendBrowser, nil)); err == nil {
		t.Fatal("handler should return the adapter error")
	}
	rendered := metrics.Render()
	for _, want := range []string{
		`job_total{status="error",type="send.browser"} 1`,
		"job_duration_seconds_count{type=\"send.browser\"} 1",
	} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("metrics missing %q:\n%s", want, rendered)
		}
	}
}

func TestNewMuxFailsClosedForUnconfiguredHandlers(t *testing.T) {
	mux := NewMux(nil, nil)
	err := mux.ProcessTask(context.Background(), asynq.NewTask(asynqqueue.KindSendBrowser, []byte(`{"outbox_id":"unused"}`)))
	if err == nil || !strings.Contains(err.Error(), "not configured") {
		t.Fatalf("unconfigured handler should fail closed, got %v", err)
	}
}
