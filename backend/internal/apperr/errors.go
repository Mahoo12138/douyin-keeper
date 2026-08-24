// Package apperr defines the unified application error model (docs/14 §9).
// Every domain package returns *AppError (wrapping typed domain errors); the
// HTTP layer maps Kind -> status code and Code stays a stable API contract.
package apperr

import (
	"errors"
	"fmt"
)

// Kind maps to an HTTP status class (docs/14 §9).
type Kind string

const (
	KindValidation      Kind = "validation"
	KindUnauthenticated Kind = "unauthenticated"
	KindForbidden       Kind = "forbidden"
	KindNotFound        Kind = "not_found"
	KindConflict        Kind = "conflict"
	KindQuota           Kind = "quota"
	KindExternal        Kind = "external"
	KindTransient       Kind = "transient"
	KindInternal        Kind = "internal"
)

// Stable error codes (docs/11 §13, docs/06 §6). These are part of the
// frontend <-> backend contract and must not change casually.
const (
	CodeUnauthenticated    = "UNAUTHENTICATED"
	CodeInvalidCredentials = "INVALID_CREDENTIALS"
	CodeForbidden          = "FORBIDDEN"
	CodeUserDisabled       = "USER_DISABLED"
	CodeNotFound           = "NOT_FOUND"
	CodeConflict           = "CONFLICT"

	CodeWechatNotLinked = "WECHAT_IDENTITY_NOT_LINKED"
	CodeLinkCodeInvalid = "LINK_CODE_INVALID"
	CodeLinkCodeExpired = "LINK_CODE_EXPIRED"

	CodeAccountBusy               = "ACCOUNT_BUSY"
	CodeAccountPaused             = "ACCOUNT_PAUSED"
	CodeAccountCooldownActive     = "ACCOUNT_COOLDOWN_ACTIVE"
	CodeJobNotCancelable          = "JOB_NOT_CANCELABLE"
	CodeFriendNotFound            = "FRIEND_NOT_FOUND"
	CodeFriendIdentityUnsolid     = "FRIEND_IDENTITY_UNRESOLVED"
	CodeFriendAmbiguous           = "FRIEND_AMBIGUOUS"
	CodeConversationNotFound      = "CONVERSATION_NOT_FOUND"
	CodeTargetIdentityMismatch    = "TARGET_IDENTITY_MISMATCH"
	CodeSessionExpired            = "SESSION_EXPIRED"
	CodeQRExpired                 = "QR_EXPIRED"
	CodeSMSExpired                = "SMS_CODE_EXPIRED"
	CodeAccountIdentityUnresolved = "ACCOUNT_IDENTITY_UNRESOLVED"
	CodeChallengeRequired         = "CHALLENGE_REQUIRED"
	CodePlatformRateLimited       = "PLATFORM_RATE_LIMITED"
	CodeAdapterUnavailable        = "ADAPTER_UNAVAILABLE"
	CodeAdapterIncompatible       = "ADAPTER_INCOMPATIBLE"
	CodeBrowserSelectorChanged    = "BROWSER_SELECTOR_CHANGED"
	CodeNetworkTimeout            = "NETWORK_TIMEOUT"
	CodeOutcomeUnknown            = "OUTCOME_UNKNOWN"

	CodeEntitlementRequired     = "ENTITLEMENT_REQUIRED"
	CodeEntitlementExpired      = "ENTITLEMENT_EXPIRED"
	CodeEntitlementPlanConflict = "ENTITLEMENT_PLAN_CONFLICT"
	CodeFeatureNotEntitled      = "FEATURE_NOT_ENTITLED"
	CodeAccountQuotaExceeded    = "ACCOUNT_QUOTA_EXCEEDED"
	CodeTaskQuotaExceeded       = "TASK_QUOTA_EXCEEDED"
	CodeDailySendQuotaExceeded  = "DAILY_SEND_QUOTA_EXCEEDED"

	CodeInternal = "INTERNAL_ERROR"
)

// AppError is the canonical error for the whole backend. Code is exposed to
// the API; Cause (when set) carries internals that are logged but never
// returned to clients.
type AppError struct {
	Code      string
	Kind      Kind
	Retryable bool
	Msg       string
	Cause     error
}

func (e *AppError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s(%s): %s: %v", e.Code, e.Kind, e.Msg, e.Cause)
	}
	return fmt.Sprintf("%s(%s): %s", e.Code, e.Kind, e.Msg)
}

func (e *AppError) Unwrap() error { return e.Cause }

func New(code string, kind Kind, msg string) *AppError {
	return &AppError{Code: code, Kind: kind, Msg: msg}
}

func Wrap(code string, kind Kind, msg string, cause error) *AppError {
	e := New(code, kind, msg)
	e.Cause = cause
	if cause != nil {
		var app *AppError
		if errors.As(cause, &app) {
			e.Retryable = app.Retryable
		}
	}
	return e
}

func As(err error) (*AppError, bool) {
	var e *AppError
	if errors.As(err, &e) {
		return e, true
	}
	return nil, false
}

// KindOf returns the error kind, defaulting to internal for non-app errors.
func KindOf(err error) Kind {
	if e, ok := As(err); ok {
		return e.Kind
	}
	return KindInternal
}

// Validation builds a 400 error.
func Validation(code, msg string) *AppError { return New(code, KindValidation, msg) }

// Unauthorized builds a 401 error.
func Unauthorized(code, msg string) *AppError { return New(code, KindUnauthenticated, msg) }

// NotFound builds a 404 error.
func NotFound(code, msg string) *AppError { return New(code, KindNotFound, msg) }

// Conflict builds a 409 error.
func Conflict(code, msg string) *AppError { return New(code, KindConflict, msg) }
