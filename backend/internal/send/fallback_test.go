package send

import (
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
)

func TestCanFallbackRequiresExplicitNotSentEvidence(t *testing.T) {
	if !CanFallback(capability.AdapterProtocolIM, capability.AdapterBrowserConsumer, "ADAPTER_INCOMPATIBLE", FailureEvidence{Outcome: OutcomeNotSent}) {
		t.Fatal("explicit not-sent incompatibility should fall back")
	}
	if CanFallback(capability.AdapterProtocolIM, capability.AdapterBrowserConsumer, "ADAPTER_INCOMPATIBLE", FailureEvidence{Outcome: OutcomeUnknown}) {
		t.Fatal("unknown outcome must not fall back")
	}
	if CanFallback(capability.AdapterBrowserConsumer, capability.AdapterProtocolIM, "ADAPTER_INCOMPATIBLE", FailureEvidence{Outcome: OutcomeNotSent}) {
		t.Fatal("browser must not fall back to the unavailable protocol adapter")
	}
}

func TestFailureEvidenceAcceptsExplicitFalseWriteFlag(t *testing.T) {
	notAccepted := false
	if !(FailureEvidence{PlatformWriteAccepted: &notAccepted}).ConfirmsNotSent() {
		t.Fatal("false platform write flag should confirm not sent")
	}
	if (FailureEvidence{Outcome: OutcomeUnknown, PlatformWriteAccepted: &notAccepted}).ConfirmsNotSent() {
		t.Fatal("contradictory unknown outcome must remain fail-closed")
	}
}
