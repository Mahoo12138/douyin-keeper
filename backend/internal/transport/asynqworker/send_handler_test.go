package asynqworker

import (
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

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
