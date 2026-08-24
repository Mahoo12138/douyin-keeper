// Package sidecar defines the Go-side protocol contract for the Playwright /
// Protocol sidecars (docs/10). Transport is NDJSON over stdin/stdout; a
// process client implementation arrives with the real adapters (M1).
package sidecar

import (
	"context"
)

// ProtocolVersion is the v1 envelope version (sidecar-protocol-v1.schema.json).
const ProtocolVersion = 1

// Ops are the v1 operations (docs/10 §4).
const (
	OpsHealthCheck        = "health.check"
	OpsLoginQRStart       = "login.qr.start"
	OpsLoginQRPoll        = "login.qr.poll"
	OpsLoginSMSStart      = "login.sms.start"
	OpsLoginSMSVerify     = "login.sms.verify"
	OpsSessionValidate    = "session.validate"
	OpsFriendsList        = "friends.list"
	OpsConversationsList  = "conversations.list"
	OpsMessageSendText    = "message.send_text"
	OpsMessageSendSticker = "message.send_sticker"
	OpsMessageSendFirst   = "message.send_first"
)

// Request is the proto request envelope.
type Request struct {
	ProtocolVersion int    `json:"protocol_version"`
	RequestID       string `json:"request_id"`
	Op              string `json:"op"`
	DeadlineMS      int    `json:"deadline_ms"`
	Input           any    `json:"input"`
}

// Meta is the adapter metadata on every response.
type Meta struct {
	Adapter        string `json:"adapter"`
	AdapterVersion string `json:"adapter_version"`
	DurationMS     int    `json:"duration_ms"`
}

// Error mirrors the protocol error object.
type Error struct {
	Code      string `json:"code"`
	Retryable bool   `json:"retryable"`
	Message   string `json:"message"`
	Detail    any    `json:"detail,omitempty"`
}

// Response is either a success or a failure envelope.
type Response struct {
	ProtocolVersion int    `json:"protocol_version"`
	RequestID       string `json:"request_id"`
	OK              bool   `json:"ok"`
	Result          any    `json:"result,omitempty"`
	Error           *Error `json:"error,omitempty"`
	Meta            Meta   `json:"meta"`
}

// Stable error codes (docs/10 §11).
const (
	ErrInvalidRequest         = "INVALID_REQUEST"
	ErrUnsupportedProtocol    = "UNSUPPORTED_PROTOCOL_VERSION"
	ErrUnsupportedOperation   = "UNSUPPORTED_OPERATION"
	ErrDeadlineExceeded       = "DEADLINE_EXCEEDED"
	ErrSessionExpired         = "SESSION_EXPIRED"
	ErrQRExpired              = "QR_EXPIRED"
	ErrLoginHandleNotFound    = "LOGIN_HANDLE_NOT_FOUND"
	ErrChallengeRequired      = "CHALLENGE_REQUIRED"
	ErrPlatformRateLimited    = "PLATFORM_RATE_LIMITED"
	ErrBrowserSelectorChanged = "BROWSER_SELECTOR_CHANGED"
	ErrFriendNotFound         = "FRIEND_NOT_FOUND"
	ErrFriendAmbiguous        = "FRIEND_AMBIGUOUS"
	ErrConversationNotFound   = "CONVERSATION_NOT_FOUND"
	ErrTargetIdentityMismatch = "TARGET_IDENTITY_MISMATCH"
	ErrAdapterUnavailable     = "ADAPTER_UNAVAILABLE"
	ErrAdapterIncompatible    = "ADAPTER_INCOMPATIBLE"
	ErrNetworkTimeout         = "NETWORK_TIMEOUT"
	ErrInternal               = "SIDECAR_INTERNAL_ERROR"
)

// Client is the Go-side abstraction over one sidecar transport. The M1
// implementation spawns the sidecar process and speaks NDJSON.
type Client interface {
	Call(ctx context.Context, req Request) (*Response, error)
}

// NopClient returns an adapter-unavailable error for every call. It keeps the
// adapter resolver compiling until a real sidecar is wired (M1).
type NopClient struct{}

func (NopClient) Call(_ context.Context, req Request) (*Response, error) {
	return &Response{
		ProtocolVersion: ProtocolVersion, RequestID: req.RequestID, OK: false,
		Error: &Error{Code: ErrAdapterUnavailable, Retryable: false, Message: "no sidecar configured"},
		Meta:  Meta{Adapter: "nop", AdapterVersion: "0"},
	}, nil
}
