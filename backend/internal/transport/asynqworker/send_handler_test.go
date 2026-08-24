package asynqworker

import (
	"strings"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

func TestShouldRetrySendRequiresSidecarProofAndAllowlist(t *testing.T) {
	if shouldRetrySend(&sidecar.Response{OK: false, Error: &sidecar.Error{Code: sidecar.ErrAdapterUnavailable, Retryable: true}}) != true {
		t.Fatal("retryable adapter-unavailable response should retry")
	}
	if shouldRetrySend(&sidecar.Response{OK: false, Error: &sidecar.Error{Code: sidecar.ErrNetworkTimeout, Retryable: true}}) != true {
		t.Fatal("explicitly safe network timeout should retry")
	}
	if shouldRetrySend(&sidecar.Response{OK: false, Error: &sidecar.Error{Code: sidecar.ErrNetworkTimeout, Retryable: false}}) {
		t.Fatal("unknown network timeout must fail closed")
	}
	if shouldRetrySend(&sidecar.Response{OK: false, Error: &sidecar.Error{Code: sidecar.ErrAdapterIncompatible, Retryable: true}}) {
		t.Fatal("adapter incompatibility must not retry")
	}
}

func TestObserveSendMetricUsesTerminalStatus(t *testing.T) {
	metrics := telemetry.NewMetrics()
	observeSendMetric(metrics, capability.AdapterBrowserConsumer, string(send.IntentSucceeded))
	if !strings.Contains(metrics.Render(), `send_total{adapter="browser.consumer",status="succeeded"} 1`) {
		t.Fatalf("send metric missing terminal status:\n%s", metrics.Render())
	}
}

func TestSendRetryDelayMatchesDesignBackoff(t *testing.T) {
	if sendRetryDelay(1) != 30*time.Second || sendRetryDelay(2) != 2*time.Minute || sendRetryDelay(3) != 10*time.Minute {
		t.Fatalf("unexpected retry delays")
	}
}

func TestMapSendSidecarErrors(t *testing.T) {
	tests := map[string]string{
		sidecar.ErrSessionExpired:         apperr.CodeSessionExpired,
		sidecar.ErrChallengeRequired:      apperr.CodeChallengeRequired,
		sidecar.ErrConversationNotFound:   apperr.CodeConversationNotFound,
		sidecar.ErrTargetIdentityMismatch: apperr.CodeTargetIdentityMismatch,
		sidecar.ErrBrowserSelectorChanged: apperr.CodeAdapterIncompatible,
	}
	for input, want := range tests {
		if got := mapSendSidecarError(input); got != want {
			t.Errorf("mapSendSidecarError(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSendSidecarErrorCodeTreatsMalformedResponseAsUnavailable(t *testing.T) {
	if got := sendSidecarErrorCode(nil); got != sidecar.ErrAdapterUnavailable {
		t.Fatalf("nil response code = %q", got)
	}
}

func TestMessageSendSpecSelectsOperationAndPayload(t *testing.T) {
	tests := []struct {
		name, kind, body, capability, operation, key string
	}{
		{name: "text", kind: "text", body: "  晚安  ", capability: capability.NameMessageTextExisting, operation: sidecar.OpsMessageSendText, key: "text"},
		{name: "sticker", kind: "sticker", body: "  sticker_001  ", capability: capability.NameMessageSticker, operation: sidecar.OpsMessageSendSticker, key: "sticker_id"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := messageSendSpec(tt.kind, tt.body)
			if err != nil {
				t.Fatal(err)
			}
			if got.Capability != tt.capability || got.Operation != tt.operation || got.Message[tt.key] != strings.TrimSpace(tt.body) {
				t.Fatalf("unexpected message spec: %+v", got)
			}
		})
	}
}

func TestMessageSendSpecRejectsUnsupportedOrEmptyPayload(t *testing.T) {
	for _, tt := range []struct{ kind, body string }{{kind: "sticker", body: "  "}, {kind: "voice", body: "voice_001"}} {
		if _, err := messageSendSpec(tt.kind, tt.body); err == nil {
			t.Errorf("messageSendSpec(%q, %q) should fail", tt.kind, tt.body)
		}
	}
}

func TestRequiredTaskFeatureOnlyGatesCreatorFirstMessage(t *testing.T) {
	if got := requiredTaskFeature(false); got != "" {
		t.Fatalf("requiredTaskFeature(false) = %q, want empty", got)
	}
	if got := requiredTaskFeature(true); got != entitlement.FeatureCreatorFirstMessage {
		t.Fatalf("requiredTaskFeature(true) = %q, want %q", got, entitlement.FeatureCreatorFirstMessage)
	}
}

func TestMessageSendSpecSelectsProtocolFirstMessageOperation(t *testing.T) {
	plan, err := messageSendSpecForAdapter("text", "  你好  ", capability.AdapterProtocolIM, true)
	if err != nil {
		t.Fatalf("messageSendSpecForAdapter() error = %v", err)
	}
	if plan.Capability != capability.NameMessageTextFirst || plan.Operation != sidecar.OpsMessageSendFirst || plan.Message["text"] != "你好" {
		t.Fatalf("unexpected protocol first-message plan: %+v", plan)
	}
	if _, err := messageSendSpecForAdapter("text", "hello", capability.AdapterBrowserConsumer, true); err == nil {
		t.Fatal("browser adapter must not execute first-message tasks")
	}
}
