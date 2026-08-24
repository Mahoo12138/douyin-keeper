package send

import "github.com/mahoo12138/douyin-keeper/backend/internal/capability"

type Outcome string

const (
	OutcomeNotSent   Outcome = "not_sent"
	OutcomeUnknown   Outcome = "unknown"
	OutcomeConfirmed Outcome = "confirmed"
)

// FailureEvidence is supplied by an adapter, not inferred from transport
// errors. A missing or unknown outcome must remain fail-closed.
type FailureEvidence struct {
	Outcome               Outcome
	PlatformWriteAccepted *bool
}

func (e FailureEvidence) ConfirmsNotSent() bool {
	if e.Outcome == OutcomeConfirmed || e.Outcome == OutcomeUnknown {
		return false
	}
	return e.Outcome == OutcomeNotSent || (e.Outcome == "" && e.PlatformWriteAccepted != nil && !*e.PlatformWriteAccepted)
}

// CanFallback permits only the documented protocol-to-browser transition.
// Adapter incompatibility alone is insufficient: the adapter must explicitly
// prove that the platform did not accept a write.
func CanFallback(fromAdapter, toAdapter, errorCode string, evidence FailureEvidence) bool {
	if fromAdapter != capability.AdapterProtocolIM || toAdapter != capability.AdapterBrowserConsumer {
		return false
	}
	if errorCode != "ADAPTER_INCOMPATIBLE" && errorCode != "UNSUPPORTED_PROTOCOL_VERSION" {
		return false
	}
	return evidence.ConfirmsNotSent()
}
