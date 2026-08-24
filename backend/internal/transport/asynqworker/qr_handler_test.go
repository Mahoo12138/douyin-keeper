package asynqworker

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

func TestQRResultDecoders(t *testing.T) {
	response := &sidecar.Response{
		ProtocolVersion: sidecar.ProtocolVersion,
		OK:              true,
		Result: map[string]any{
			"login_handle": "qr_test",
			"qr":           map[string]any{"format": "data_url", "value": "data:image/png;base64,opaque"},
		},
	}
	var result qrStartResult
	if err := decodeResult(response, &result); err != nil {
		t.Fatal(err)
	}
	if result.LoginHandle != "qr_test" || result.QR.Value == "" {
		t.Fatalf("unexpected QR result: %+v", result)
	}

	bad := &sidecar.Response{OK: false, Error: &sidecar.Error{Code: sidecar.ErrQRExpired}}
	if got := sidecarErrorCode(bad); got != sidecar.ErrQRExpired {
		t.Fatalf("error code = %q", got)
	}
	if got := mapSidecarError(sidecar.ErrQRExpired); got != apperr.CodeQRExpired {
		t.Fatalf("mapped QR expiry = %q", got)
	}
	if got := mapSidecarError(sidecar.ErrSMSCodeExpired); got != apperr.CodeSMSExpired {
		t.Fatalf("mapped SMS expiry = %q", got)
	}
}

func TestSleepContextStopsOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := sleepContext(ctx, time.Second); err == nil {
		t.Fatal("expected cancellation")
	}
}

func TestMustJSONIsSafeForJobEvents(t *testing.T) {
	payload := mustJSON(map[string]string{"code": apperr.CodeChallengeRequired})
	var decoded map[string]string
	if err := json.Unmarshal(payload, &decoded); err != nil || decoded["code"] != apperr.CodeChallengeRequired {
		t.Fatalf("invalid event payload: %s", payload)
	}
}
