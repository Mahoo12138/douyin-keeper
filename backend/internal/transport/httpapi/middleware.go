package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
)

type reqIDKey struct{}

func newRequestID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// RequestID injects a request_id into context + response header (docs/13 §7).
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := newRequestID()
		ctx := context.WithValue(r.Context(), reqIDKey{}, id)
		ctx = telemetry.WithContext(ctx, telemetry.L(r.Context()).With("request_id", id))
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Recover converts panics into 500s.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				telemetry.L(r.Context()).Error("panic", "value", rec)
				writeError(w, r, apperr.New(apperr.CodeInternal, apperr.KindInternal, "internal error"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// SecurityHeaders applies the baseline headers.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// AccessLog logs a redacted one-liner per request (docs/14 §15).
func AccessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		lw := &loggingWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(lw, r)
		telemetry.L(r.Context()).Info("http",
			"method", r.Method, "path", r.URL.Path, "status", lw.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

type loggingWriter struct {
	http.ResponseWriter
	status int
}

func (w *loggingWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// Flush preserves streaming responses such as Job SSE through AccessLog.
// Wrapping ResponseWriter must not accidentally make http.Flusher disappear.
func (w *loggingWriter) Flush() {
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// rateLimiter is a minimal in-memory fixed-window limiter (docs/13 §15).
type rateLimiter struct {
	mu     sync.Mutex
	visits map[string][]time.Time
	limit  int
	window time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{visits: map[string][]time.Time{}, limit: limit, window: window}
}

func (rl *rateLimiter) allow(key string) bool {
	return rl.allowKeys(key)
}

func (rl *rateLimiter) allowKeys(keys ...string) bool {
	unique := make([]string, 0, len(keys))
	seenKeys := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		if key == "" {
			continue
		}
		if _, seen := seenKeys[key]; seen {
			continue
		}
		seenKeys[key] = struct{}{}
		unique = append(unique, key)
	}
	if len(unique) == 0 {
		return false
	}

	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	cutoff := now.Add(-rl.window)
	keptByKey := make(map[string][]time.Time, len(unique))
	blocked := false
	for _, key := range unique {
		seen := rl.visits[key]
		kept := seen[:0]
		for _, visitedAt := range seen {
			if visitedAt.After(cutoff) {
				kept = append(kept, visitedAt)
			}
		}
		if len(kept) >= rl.limit {
			blocked = true
		}
		keptByKey[key] = kept
	}
	for key, kept := range keptByKey {
		if len(kept) == 0 {
			delete(rl.visits, key)
		} else {
			rl.visits[key] = kept
		}
	}
	if blocked {
		return false
	}
	for _, key := range unique {
		rl.visits[key] = append(rl.visits[key], now)
	}
	return true
}

// RateLimit guards one route independently per client IP.
func RateLimit(limit int, window time.Duration) func(http.Handler) http.Handler {
	return RateLimitKeys(limit, window, func(r *http.Request) []string { return []string{"ip:" + clientIP(r)} })
}

// RateLimitKeys builds independent dimensions from the request. A request is
// accepted only when every dimension has capacity, and a rejected request does
// not consume a partial token in the other dimensions.
func RateLimitKeys(limit int, window time.Duration, keys func(*http.Request) []string) func(http.Handler) http.Handler {
	rl := newRateLimiter(limit, window)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if keys == nil || !rl.allowKeys(keys(r)...) {
				writeError(w, r, apperr.New(apperr.CodePlatformRateLimited, apperr.KindQuota, "too many requests"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RateLimitUserAndIP protects authenticated abuse-sensitive operations such
// as card redemption and link-code generation across both identity and source
// network, including when one dimension is rotated.
func RateLimitUserAndIP(limit int, window time.Duration) func(http.Handler) http.Handler {
	return RateLimitKeys(limit, window, func(r *http.Request) []string {
		keys := []string{"ip:" + clientIP(r)}
		if principal, ok := auth.PrincipalFrom(r.Context()); ok {
			keys = append(keys, "user:"+strconv.FormatInt(principal.UserID, 10))
		}
		return keys
	})
}

func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return strings.TrimSpace(strings.Split(ip, ",")[0])
	}
	if host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr)); err == nil {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

// RequireAuth authenticates the Bearer token and loads the user (docs/13 §7).
// Disabled users are rejected on every request.
func RequireAuth(signingKey []byte, users authUserResolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			principal, err := authenticate(r, signingKey, users)
			if err != nil {
				writeError(w, r, err)
				return
			}
			next.ServeHTTP(w, r.WithContext(auth.WithPrincipal(r.Context(), principal)))
		})
	}
}

// RequiresRole wraps RequireAuth with an admin check (docs/13 §6).
func RequiresRole(role auth.Role, signingKey []byte, users authUserResolver) func(http.Handler) http.Handler {
	base := RequireAuth(signingKey, users)
	return func(next http.Handler) http.Handler {
		return base(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := auth.PrincipalFrom(r.Context())
			if !ok {
				writeError(w, r, apperr.Unauthorized(apperr.CodeUnauthenticated, "authentication required"))
				return
			}
			if p.Role != role {
				writeError(w, r, apperr.New(apperr.CodeForbidden, apperr.KindForbidden, "requires admin role"))
				return
			}
			next.ServeHTTP(w, r)
		}))
	}
}

// authUserResolver is the slice used by middleware to reload the user.
type authUserResolver interface {
	GetUserByPublicID(ctx context.Context, id uuid.UUID) (*auth.User, error)
}

func authenticate(r *http.Request, signingKey []byte, users authUserResolver) (auth.Principal, error) {
	raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return auth.Principal{}, apperr.Unauthorized(apperr.CodeUnauthenticated, "missing bearer token")
	}
	claims, err := auth.ParseAccess(signingKey, raw)
	if err != nil {
		slog.Debug("token parse failed", "err", err)
		return auth.Principal{}, apperr.Unauthorized(apperr.CodeUnauthenticated, "invalid or expired token")
	}
	userPub, err := uuid.Parse(claims.Subject)
	if err != nil {
		return auth.Principal{}, apperr.Unauthorized(apperr.CodeUnauthenticated, "invalid token subject")
	}
	user, err := users.GetUserByPublicID(r.Context(), userPub)
	if err != nil {
		return auth.Principal{}, err
	}
	// ClientType from claims; if empty default web.
	ct := auth.ClientType(claims.Client)
	if ct == "" {
		ct = auth.ClientWeb
	}
	return auth.Principal{
		UserID: user.ID, UserPublicID: user.PublicID, Role: user.Role, ClientType: ct,
	}, nil
}
