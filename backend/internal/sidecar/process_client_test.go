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
	if _, err := client.Call(context.Background(), Request{RequestID: "r3", Op: OpsHealthCheck, DeadlineMS: MinDeadlineMS - 1}); err == nil {
		t.Fatal("deadline below contract minimum should be rejected")
	}
	if _, err := client.Call(context.Background(), Request{RequestID: "r4", Op: OpsHealthCheck, Input: []string{"not", "an", "object"}}); err == nil {
		t.Fatal("non-object input should be rejected")
	}
}

func TestProcessClientRejectsInconsistentResponseEnvelope(t *testing.T) {
	script := `while IFS= read -r line; do printf '%s\n' '{"protocol_version":1,"request_id":"r1","ok":true,"error":{"code":"BAD"},"result":{},"meta":{"adapter":"test","adapter_version":"1","duration_ms":0}}'; done`
	client := NewProcessClient("sh", "-c", script)
	defer client.Close()
	if _, err := client.Call(context.Background(), Request{RequestID: "r1", Op: OpsHealthCheck}); err == nil || !strings.Contains(err.Error(), "contains error") {
		t.Fatalf("expected inconsistent response error, got %v", err)
	}
}
