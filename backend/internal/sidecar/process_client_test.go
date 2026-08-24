package sidecar

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestProcessClientCallAndReuse(t *testing.T) {
	// The helper intentionally ignores input and emits a valid v1 envelope;
	// this tests stream framing without requiring Playwright in CI.
	script := `while IFS= read -r line; do printf '%s\n' '{"protocol_version":1,"request_id":"r1","ok":true,"result":{"valid":true},"meta":{"adapter":"test","adapter_version":"1","duration_ms":0}}'; done`
	client := NewProcessClient("sh", "-c", script)
	defer client.Close()

	response, err := client.Call(context.Background(), Request{RequestID: "r1", Op: OpsHealthCheck})
	if err != nil {
		t.Fatal(err)
	}
	if !response.OK {
		t.Fatal("expected successful response")
	}
	response, err = client.Call(context.Background(), Request{RequestID: "r1", Op: OpsHealthCheck})
	if err != nil || response == nil {
		t.Fatalf("expected reusable process, response=%v err=%v", response, err)
	}
}

func TestProcessClientRejectsMismatchedRequestID(t *testing.T) {
	script := `while IFS= read -r line; do printf '%s\n' '{"protocol_version":1,"request_id":"wrong","ok":true,"result":{},"meta":{"adapter":"test","adapter_version":"1","duration_ms":0}}'; done`
	client := NewProcessClient("sh", "-c", script)
	defer client.Close()
	_, err := client.Call(context.Background(), Request{RequestID: "expected", Op: OpsHealthCheck})
	if err == nil || !strings.Contains(err.Error(), "request_id") {
		t.Fatalf("expected request id error, got %v", err)
	}
}

func TestProcessClientContextCancellationStopsProcess(t *testing.T) {
	client := NewProcessClient("sh", "-c", "while IFS= read -r line; do sleep 10; done")
	defer client.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, err := client.Call(ctx, Request{RequestID: "r1", Op: OpsHealthCheck})
	if err == nil {
		t.Fatal("expected context cancellation")
	}
}

func TestProcessClientDoesNotStartAfterDeadlineWhileWaitingForSerializedCall(t *testing.T) {
	client := NewProcessClient("/definitely/missing/douyin-sidecar")
	client.mu.Lock()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	result := make(chan error, 1)
	go func() {
		_, err := client.Call(ctx, Request{RequestID: "r1", Op: OpsHealthCheck})
		result <- err
	}()

	time.Sleep(40 * time.Millisecond)
	client.mu.Unlock()

	if err := <-result; !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline while waiting for serialized call, got %v", err)
	}
}

func TestProcessClientMarksStartFailureAsSafeRetryBoundary(t *testing.T) {
	client := NewProcessClient("/definitely/missing/douyin-sidecar")
	_, err := client.Call(context.Background(), Request{RequestID: "r1", Op: OpsHealthCheck})
	if err == nil || !errors.Is(err, ErrProcessStart) {
		t.Fatalf("expected ErrProcessStart, got %v", err)
	}
}

func TestProcessClientNormalizesAndValidatesRequestEnvelope(t *testing.T) {
	script := `while IFS= read -r line; do printf '%s\n' '{"protocol_version":1,"request_id":"r1","ok":true,"result":{},"meta":{"adapter":"test","adapter_version":"1","duration_ms":0}}'; done`
	client := NewProcessClient("sh", "-c", script)
	defer client.Close()
	if _, err := client.Call(context.Background(), Request{RequestID: "r1", Op: OpsHealthCheck}); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Call(context.Background(), Request{RequestID: "r2", Op: "not-an-op"}); err == nil {
		t.Fatal("unknown operation should be rejected")
	}
	if !IsKnownOperation(OpsConversationsArchive) {
		t.Fatal("platform archive operation should be part of the v1 contract")
	}
	if _, err := client.Call(context.Background(), Request{RequestID: "r3", Op: OpsHealthCheck, DeadlineMS: MinDeadlineMS - 1}); err == nil {
		t.Fatal("deadline below contract minimum should be rejected")
	}
	if _, err := client.Call(context.Background(), Request{RequestID: "r4", Op: OpsHealthCheck, Input: []string{"not", "an", "object"}}); err == nil {
		t.Fatal("non-object input should be rejected")
	}
}

func TestProcessClientValidatesFirstMessageInputBeforeStartingAdapter(t *testing.T) {
	client := NewProcessClient("/definitely/missing/douyin-sidecar")
	base := map[string]any{
		"session": map[string]any{"kind": "playwright_storage_state_file", "path": "/tmp/session.json"},
		"target":  map[string]any{"platform_user_id": "user-1"},
		"message": map[string]any{"text": "hello"},
	}
	invalid := []map[string]any{
		{"session": base["session"], "target": map[string]any{"platform_user_id": "user-1", "platform_conversation_id": "conversation-1"}, "message": base["message"]},
		{"session": base["session"], "target": base["target"], "message": map[string]any{"text": "   "}},
		{"session": base["session"], "target": base["target"], "message": map[string]any{"text": "hello", "sticker_id": "sticker-1"}},
	}
	for _, input := range invalid {
		_, err := client.Call(context.Background(), Request{RequestID: "r1", Op: OpsMessageSendFirst, Input: input})
		if err == nil || strings.Contains(err.Error(), ErrProcessStart.Error()) {
			t.Fatalf("invalid first-message input should be rejected before process start: %v", err)
		}
	}
}

func TestProcessClientAcceptsValidFirstMessageInput(t *testing.T) {
	script := `while IFS= read -r line; do printf '%s\n' '{"protocol_version":1,"request_id":"r1","ok":true,"result":{},"meta":{"adapter":"protocol.im","adapter_version":"test","duration_ms":0}}'; done`
	client := NewProcessClient("sh", "-c", script)
	defer client.Close()
	_, err := client.Call(context.Background(), Request{
		RequestID: "r1", Op: OpsMessageSendFirst,
		Input: map[string]any{
			"session": map[string]any{"kind": "playwright_storage_state_file", "path": "/tmp/session.json"},
			"target":  map[string]any{"platform_user_id": "user-1"},
			"message": map[string]any{"text": "hello"},
		},
	})
	if err != nil {
		t.Fatalf("valid first-message input should reach adapter: %v", err)
	}
}

func TestProcessClientRejectsInconsistentResponseEnvelope(t *testing.T) {
	script := `while IFS= read -r line; do printf '%s\n' '{"protocol_version":1,"request_id":"r1","ok":true,"error":{"code":"BAD","retryable":false,"message":"bad"},"result":{},"meta":{"adapter":"test","adapter_version":"1","duration_ms":0}}'; done`
	client := NewProcessClient("sh", "-c", script)
	defer client.Close()
	if _, err := client.Call(context.Background(), Request{RequestID: "r1", Op: OpsHealthCheck}); err == nil || !strings.Contains(err.Error(), "contains error") {
		t.Fatalf("expected inconsistent response error, got %v", err)
	}
}

func TestProcessClientRejectsUnknownResponseFields(t *testing.T) {
	script := `while IFS= read -r line; do printf '%s\n' '{"protocol_version":1,"request_id":"r1","ok":true,"result":{},"meta":{"adapter":"test","adapter_version":"1","duration_ms":0},"unexpected":true}'; done`
	client := NewProcessClient("sh", "-c", script)
	defer client.Close()
	_, err := client.Call(context.Background(), Request{RequestID: "r1", Op: OpsHealthCheck})
	if err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("expected unknown-field error, got %v", err)
	}
}

func TestProcessClientRejectsIncompleteResponseEnvelope(t *testing.T) {
	script := `while IFS= read -r line; do printf '%s\n' '{"protocol_version":1,"request_id":"r1","ok":true,"result":{}}'; done`
	client := NewProcessClient("sh", "-c", script)
	defer client.Close()
	_, err := client.Call(context.Background(), Request{RequestID: "r1", Op: OpsHealthCheck})
	if err == nil || !strings.Contains(err.Error(), "missing meta") {
		t.Fatalf("expected missing-meta error, got %v", err)
	}
}

func TestProcessClientRejectsNonObjectErrorDetail(t *testing.T) {
	script := `while IFS= read -r line; do printf '%s\n' '{"protocol_version":1,"request_id":"r1","ok":false,"error":{"code":"BAD","retryable":false,"message":"bad","detail":"secret"},"meta":{"adapter":"test","adapter_version":"1","duration_ms":0}}'; done`
	client := NewProcessClient("sh", "-c", script)
	defer client.Close()
	_, err := client.Call(context.Background(), Request{RequestID: "r1", Op: OpsHealthCheck})
	if err == nil || !strings.Contains(err.Error(), "detail must be a JSON object") {
		t.Fatalf("expected detail validation error, got %v", err)
	}
}

func TestUnavailableClientPreservesAdapterIdentity(t *testing.T) {
	client := NewUnavailableClient("protocol.im", "protocol SDK is not configured")
	response, err := client.Call(context.Background(), Request{RequestID: "r1", Op: OpsMessageSendFirst})
	if err != nil || response == nil {
		t.Fatalf("response=%v err=%v", response, err)
	}
	if response.OK || response.Error == nil || response.Error.Code != ErrAdapterUnavailable {
		t.Fatalf("unexpected unavailable response: %+v", response)
	}
	if response.Meta.Adapter != "protocol.im" || response.Meta.AdapterVersion != "unconfigured" {
		t.Fatalf("adapter metadata = %+v", response.Meta)
	}
}
