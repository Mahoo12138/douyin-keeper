package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

// apiError mirrors the OpenAPI ApiError schema (docs/11 §2).
type apiError struct {
	Error apiErrorBody `json:"error"`
}

type apiErrorBody struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id"`
}

func requestID(r *http.Request) string {
	if v, ok := r.Context().Value(reqIDKey{}).(string); ok {
		return v
	}
	return ""
}

// statusFor kinds (docs/14 §9).
func statusFor(kind apperr.Kind) int {
	switch kind {
	case apperr.KindValidation:
		return http.StatusBadRequest
	case apperr.KindUnauthenticated:
		return http.StatusUnauthorized
	case apperr.KindForbidden:
		return http.StatusForbidden
	case apperr.KindNotFound:
		return http.StatusNotFound
	case apperr.KindConflict, apperr.KindQuota:
		return http.StatusConflict
	case apperr.KindExternal:
		return http.StatusServiceUnavailable
	case apperr.KindTransient:
		return http.StatusServiceUnavailable
	default:
		return http.StatusInternalServerError
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	app, _ := apperr.As(err)
	if app == nil {
		slog.Error("unhandled error", "err", err, "request_id", requestID(r))
		app = apperr.New(apperr.CodeInternal, apperr.KindInternal, "internal error")
	}
	slog.Warn("api error", "code", app.Code, "kind", app.Kind, "msg", app.Msg,
		"cause", causeString(app), "request_id", requestID(r))
	writeJSON(w, statusFor(app.Kind), apiError{Error: apiErrorBody{
		Code:      app.Code,
		Message:   app.Msg,
		RequestID: requestID(r),
	}})
}

// causeString logs the wrapped cause without ever exposing it to the client.
func causeString(e *apperr.AppError) string {
	if e.Cause != nil {
		return e.Cause.Error()
	}
	return ""
}

// caller convenience for handler errors that must not leak internals.
func writeOK(w http.ResponseWriter, v any) { writeJSON(w, http.StatusOK, v) }
func writeCreated(w http.ResponseWriter, v any) { writeJSON(w, http.StatusCreated, v) }
func writeAccepted(w http.ResponseWriter, v any) { writeJSON(w, http.StatusAccepted, v) }
func writeNoContent(w http.ResponseWriter) { w.WriteHeader(http.StatusNoContent) }