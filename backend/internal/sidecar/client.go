// Package sidecar defines the Go-side protocol contract for the Playwright /
// Protocol sidecars (docs/10). Transport is NDJSON over stdin/stdout; a
// process client implementation arrives with the real adapters (M1).
package sidecar

import (
	"context"
)

// ProtocolVersion is the v1 envelope version (sidecar-protocol-v1.schema.json).
const ProtocolVersion = 1

const (
	MinDeadlineMS     = 1_000
	MaxDeadlineMS     = 300_000
	DefaultDeadlineMS = 30_000
)

// Ops are the v1 operations (docs/10 §4).
const (
	OpsHealthCheck          = "health.check"
	OpsLoginQRStart         = "login.qr.start"
	OpsLoginQRPoll          = "login.qr.poll"
	OpsLoginQRCancel        = "login.qr.cancel"
	OpsLoginSMSStart        = "login.sms.start"
	OpsLoginSMSVerify       = "login.sms.verify"
	OpsSessionValidate      = "session.validate"
	// OpsFriendsList is retained as a source-compatibility symbol for older
	// integrations, but it is no longer supported by the Node sidecar. All
	// relationship data must come from the message-panel conversation inventory.
	OpsFriendsList          = "friends.list"
	OpsConversationsList    = "conversations.list"
	OpsConversationsArchive = "conversations.archive"
	OpsMessageSendText      = "message.send_text"
	OpsMessageSendSticker   = "message.send_sticker"
	OpsMessageSendFirst     = "message.send_first"
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
	ErrInvalidRequest             = "INVALID_REQUEST"
	ErrUnsupportedProtocol        = "UNSUPPORTED_PROTOCOL_VERSION"
	ErrUnsupportedOperation       = "UNSUPPORTED_OPERATION"
	ErrDeadlineExceeded           = "DEADLINE_EXCEEDED"
	ErrSessionExpired             = "SESSION_EXPIRED"
	ErrQRExpired                  = "QR_EXPIRED"
	ErrSMSCodeInvalid             = "SMS_CODE_INVALID"
	ErrSMSCodeExpired             = "SMS_CODE_EXPIRED"
	ErrLoginHandleNotFound        = "LOGIN_HANDLE_NOT_FOUND"
	ErrChallengeRequired          = "CHALLENGE_REQUIRED"
	ErrPlatformRateLimited        = "PLATFORM_RATE_LIMITED"
	ErrBrowserSelectorChanged     = "BROWSER_SELECTOR_CHANGED"
	ErrFriendNotFound             = "FRIEND_NOT_FOUND"
	ErrFriendAmbiguous            = "FRIEND_AMBIGUOUS"
	ErrConversationNotFound       = "CONVERSATION_NOT_FOUND"
	ErrPlatformArchiveUnavailable = "PLATFORM_ARCHIVE_UNAVAILABLE"
	ErrTargetIdentityMismatch     = "TARGET_IDENTITY_MISMATCH"
	ErrBrowserNavigationFailed    = "BROWSER_NAVIGATION_FAILED"
	ErrBrowserContextFailed       = "BROWSER_CONTEXT_FAILED"
	ErrAdapterUnavailable         = "ADAPTER_UNAVAILABLE"
	ErrAdapterIncompatible        = "ADAPTER_INCOMPATIBLE"
	ErrNetworkTimeout             = "NETWORK_TIMEOUT"
	ErrNetworkError               = "NETWORK_ERROR"
	ErrInternal                   = "SIDECAR_INTERNAL_ERROR"
)

func IsKnownOperation(op string) bool {
	switch op {
	case OpsHealthCheck, OpsLoginQRStart, OpsLoginQRPoll, OpsLoginQRCancel, OpsLoginSMSStart,
		OpsLoginSMSVerify, OpsSessionValidate, OpsConversationsList,
		OpsConversationsArchive, OpsMessageSendText, OpsMessageSendSticker, OpsMessageSendFirst:
		return true
	default:
		return false
	}
}

// Client is the Go-side abstraction over one sidecar transport. The M1
// implementation spawns the sidecar process and speaks NDJSON.
type Client interface {
	Call(ctx context.Context, req Request) (*Response, error)
}

// NopClient returns an adapter-unavailable error for every call. It is kept as
// a generic fallback for deployments that have no adapter configured.
type NopClient struct{}

func (NopClient) Call(_ context.Context, req Request) (*Response, error) {
	return &Response{
		ProtocolVersion: ProtocolVersion, RequestID: req.RequestID, OK: false,
		Error: &Error{Code: ErrAdapterUnavailable, Retryable: false, Message: "no sidecar configured"},
		Meta:  Meta{Adapter: "nop", AdapterVersion: "0"},
	}, nil
}

// UnavailableClient is an explicit fail-closed boundary for an adapter that
// is registered in the worker control plane but has no runtime SDK configured.
// Unlike NopClient it preserves the adapter identity in response metadata, so
// health and send diagnostics never attribute a protocol failure to Browser.
type UnavailableClient struct {
	Adapter string
	Version string
	Code    string
	Message string
}

func NewUnavailableClient(adapter, message string) *UnavailableClient {
	return NewUnavailableClientWithCode(adapter, ErrAdapterUnavailable, message)
}

// NewUnavailableClientWithCode keeps an adapter registered in the control
// plane while returning a precise fail-closed error, such as an incompatible
// bundle manifest.
func NewUnavailableClientWithCode(adapter, code, message string) *UnavailableClient {
	if adapter == "" {
		adapter = "unavailable"
	}
	if code == "" {
		code = ErrAdapterUnavailable
	}
	if message == "" {
		message = "adapter runtime is not configured"
	}
	return &UnavailableClient{Adapter: adapter, Version: "unconfigured", Code: code, Message: message}
}

func (c *UnavailableClient) Call(_ context.Context, req Request) (*Response, error) {
	adapter, version, code, message := c.Adapter, c.Version, c.Code, c.Message
	if adapter == "" {
		adapter = "unavailable"
	}
	if version == "" {
		version = "unconfigured"
	}
	if code == "" {
		code = ErrAdapterUnavailable
	}
	if message == "" {
		message = "adapter runtime is not configured"
	}
	return &Response{
		ProtocolVersion: ProtocolVersion,
		RequestID:       req.RequestID,
		OK:              false,
		Error:           &Error{Code: code, Retryable: false, Message: message},
		Meta:            Meta{Adapter: adapter, AdapterVersion: version},
	}, nil
}

var _ Client = (*UnavailableClient)(nil)
