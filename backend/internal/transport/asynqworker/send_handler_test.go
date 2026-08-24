package asynqworker

import (
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
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
