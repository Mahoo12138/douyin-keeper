// Package asynqworker wires Asynq handlers to the outbox kinds. Session check
// is the first real browser operation; remaining platform adapters are kept
// explicit until their contracts are implemented.
package asynqworker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/redislock"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

type PayloadLoader interface {
	FetchByPublicID(ctx context.Context, publicID string) (*postgres.PendingMessage, error)
}

var outboxKinds = []string{
	asynqqueue.KindAccountBindQR,
	asynqqueue.KindAccountBindSMS,
	asynqqueue.KindSessionCheckBrowser,
	asynqqueue.KindFriendsSyncBrowser,
	asynqqueue.KindSendDispatch,
	asynqqueue.KindSendBrowser,
	asynqqueue.KindSendProtocol,
	asynqqueue.KindCapabilityProbe,
}

// NewMux registers a stub handler for every outbox kind. The handler pulls
// the payload by stable id only — never secrets (docs/14 §10).
func NewMux(loader PayloadLoader, log *slog.Logger) *asynq.ServeMux {
	return newMux(loader, nil, nil, log)
}

// SessionCheckDeps wires the first real browser job. Other browser jobs stay
// on the stub handler until their adapter contracts are implemented.
type SessionCheckDeps struct {
	Jobs     job.Repository
	Accounts account.Repository
	Sessions interface {
		WithTempFile(context.Context, int64, uuid.UUID, uuid.UUID, func(string) error) error
	}
	Sidecar  sidecar.Client
	Redis    *redis.Client
	WorkerID string
	LockTTL  time.Duration
	Now      func() time.Time
}

func NewBrowserMux(loader PayloadLoader, deps SessionCheckDeps, log *slog.Logger) *asynq.ServeMux {
	return newMux(loader, &deps, nil, log)
}

func NewInteractiveMux(loader PayloadLoader, deps QRBindDeps, log *slog.Logger) *asynq.ServeMux {
	return newMux(loader, nil, &deps, log)
}

func newMux(loader PayloadLoader, sessionDeps *SessionCheckDeps, qrDeps *QRBindDeps, log *slog.Logger) *asynq.ServeMux {
	mux := asynq.NewServeMux()
	for _, kind := range outboxKinds {
		kind := kind
		if kind == asynqqueue.KindAccountBindQR && qrDeps != nil {
			mux.HandleFunc(kind, qrBindHandler(loader, *qrDeps))
			continue
		}
		if kind == asynqqueue.KindSessionCheckBrowser && sessionDeps != nil {
			mux.HandleFunc(kind, sessionCheckHandler(loader, *sessionDeps, log))
			continue
		}
		mux.HandleFunc(kind, func(ctx context.Context, t *asynq.Task) error {
			var env struct {
				OutboxID string `json:"outbox_id"`
			}
			_ = json.Unmarshal(t.Payload(), &env)
			// Remaining handlers are intentionally stubbed until their platform
			// adapters land; read the payload to prove
			// the relay works, then ACK.
			if env.OutboxID != "" {
				if m, err := loader.FetchByPublicID(ctx, env.OutboxID); err == nil && log != nil {
					log.Info("worker dispatch (stub)", "kind", kind, "outbox_id", env.OutboxID,
						"aggregate_kind_hint", string(m.Payload))
				}
			} else if log != nil {
				log.Warn("worker task without outbox_id", "type", t.Type())
			}
			return nil
		})
	}
	return mux
}

func sessionCheckHandler(loader PayloadLoader, deps SessionCheckDeps, log *slog.Logger) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, t *asynq.Task) error {
		var envelope struct {
			OutboxID string `json:"outbox_id"`
		}
		if err := json.Unmarshal(t.Payload(), &envelope); err != nil || envelope.OutboxID == "" {
			return fmt.Errorf("session check: invalid outbox payload")
		}
		message, err := loader.FetchByPublicID(ctx, envelope.OutboxID)
		if err != nil {
			return fmt.Errorf("session check: load outbox: %w", err)
		}
		var ref struct {
			JobID string `json:"job_id"`
		}
		if err := json.Unmarshal(message.Payload, &ref); err != nil {
			return fmt.Errorf("session check: invalid job payload: %w", err)
		}
		jobID, err := uuid.Parse(ref.JobID)
		if err != nil {
			return fmt.Errorf("session check: invalid job id: %w", err)
		}
		if deps.Now == nil {
			deps.Now = time.Now
		}
		if deps.LockTTL <= 0 {
			deps.LockTTL = 2 * time.Minute
		}
		claimed, err := deps.Jobs.Claim(ctx, jobID, deps.WorkerID, deps.LockTTL)
		if err != nil || claimed == nil {
			return err
		}
		fail := func(code string) error {
			_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "error", Payload: json.RawMessage(fmt.Sprintf(`{"code":%q}`, code)), CreatedAt: deps.Now()})
			return deps.Jobs.Finish(ctx, claimed.ID, job.StatusFailed, &code, deps.Now())
		}
		succeed := func() error {
			_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "success", Payload: json.RawMessage(`{"valid":true}`), CreatedAt: deps.Now()})
			return deps.Jobs.Finish(ctx, claimed.ID, job.StatusSucceeded, nil, deps.Now())
		}
		_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "started", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()})
		if claimed.AccountID == nil || claimed.UserID == nil || deps.Sidecar == nil || deps.Redis == nil {
			return fail(apperr.CodeInternal)
		}
		acct, err := deps.Accounts.GetByID(ctx, *claimed.AccountID)
		if err != nil || acct.UserID != *claimed.UserID {
			return fail(apperr.CodeNotFound)
		}
		lock, err := redislock.Acquire(ctx, deps.Redis, "lock:account:"+fmt.Sprint(acct.ID), claimed.PublicID.String(), deps.LockTTL)
		if err != nil {
			return fail(apperr.CodeAccountBusy)
		}
		defer func() { _ = lock.Release(context.Background()) }()
		var response *sidecar.Response
		err = deps.Sessions.WithTempFile(ctx, acct.ID, acct.UserPublicID, acct.PublicID, func(path string) error {
			requestID := uuid.New().String()
			response, err = deps.Sidecar.Call(ctx, sidecar.Request{
				ProtocolVersion: sidecar.ProtocolVersion, RequestID: requestID,
				Op: sidecar.OpsSessionValidate, DeadlineMS: 60_000,
				Input: map[string]any{"session": map[string]any{"kind": "playwright_storage_state_file", "path": path}},
			})
			return err
		})
		if err != nil {
			code := apperr.CodeAdapterUnavailable
			if app, ok := apperr.As(err); ok {
				code = app.Code
			}
			if code == apperr.CodeSessionExpired {
				_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionExpired, deps.Now())
			}
			return fail(code)
		}
		if response == nil || !response.OK {
			code := apperr.CodeAdapterUnavailable
			if response != nil && response.Error != nil {
				code = response.Error.Code
			}
			switch code {
			case sidecar.ErrSessionExpired:
				_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionExpired, deps.Now())
				return fail(apperr.CodeSessionExpired)
			case sidecar.ErrChallengeRequired:
				_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionChallengeRequired, deps.Now())
				return fail(apperr.CodeChallengeRequired)
			default:
				return fail(code)
			}
		}
		var result struct {
			Valid bool `json:"valid"`
		}
		body, err := json.Marshal(response.Result)
		if err != nil || json.Unmarshal(body, &result) != nil || !result.Valid {
			_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionExpired, deps.Now())
			return fail(apperr.CodeSessionExpired)
		}
		if err := deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionValid, deps.Now()); err != nil {
			return fail(apperr.CodeInternal)
		}
		if log != nil {
			log.Info("session check succeeded", "job_public_id", claimed.PublicID, "account_public_id", acct.PublicID)
		}
		return succeed()
	}
}

// ServerConfig maps a worker pool to its queues (docs/15 §18).
func ServerConfig(pool string) map[string]int {
	switch pool {
	case "interactive":
		return map[string]int{asynqqueue.QueueInteractive: 2}
	case "browser":
		return map[string]int{asynqqueue.QueueBrowser: 3}
	default: // light
		return map[string]int{asynqqueue.QueueLight: 8}
	}
}
