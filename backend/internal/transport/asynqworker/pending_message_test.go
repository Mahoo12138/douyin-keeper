package asynqworker

import (
	"errors"
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestRequirePendingMessageRejectsNilResults(t *testing.T) {
	if _, err := requirePendingMessage(nil, nil, "load outbox"); err == nil {
		t.Fatal("nil pending message must be rejected")
	}
}

func TestRequirePendingMessagePreservesRepositoryError(t *testing.T) {
	want := errors.New("database unavailable")
	if _, err := requirePendingMessage(nil, want, "load outbox"); !errors.Is(err, want) {
		t.Fatalf("error = %v, want wrapped repository error", err)
	}
}

func TestRequirePendingMessageReturnsValue(t *testing.T) {
	want := &postgres.PendingMessage{}
	got, err := requirePendingMessage(want, nil, "load outbox")
	if err != nil || got != want {
		t.Fatalf("got (%p, %v), want (%p, nil)", got, err, want)
	}
}
