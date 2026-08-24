package asynqworker

import (
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
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
