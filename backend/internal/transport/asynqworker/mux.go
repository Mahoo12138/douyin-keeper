// Package asynqworker wires Asynq handlers to the outbox kinds. Session check,
// friends sync and confirmed browser message sends are wired here; the actual
// platform behavior remains behind the Sidecar contract.
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
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/redislock"
	wechatinfra "github.com/mahoo12138/douyin-keeper/backend/internal/infra/wechat"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
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
	asynqqueue.KindNotificationWechat,
}

// NewMux registers a stub handler for every outbox kind. The handler pulls
// the payload by stable id only — never secrets (docs/14 §10).
func NewMux(loader PayloadLoader, log *slog.Logger) *asynq.ServeMux {
	return newMux(loader, nil, nil, nil, log)
}

// SessionCheckDeps wires the session-check, friends-sync and browser-send jobs.
// Sidecar availability/capability checks remain the final execution gate.
type SessionCheckDeps struct {
	Jobs     job.Repository
	Accounts account.Repository
	Sessions interface {
		WithTempFile(context.Context, int64, uuid.UUID, uuid.UUID, func(string) error) error
	}
	Sidecar sidecar.Client
	Redis   *redis.Client
	Friends friend.SyncRepository
	Targets friend.SendTargetRepository
	Tasks   interface {
		GetByID(context.Context, int64) (*task.SparkTask, error)
	}
	Sends        send.Repository
	Capabilities interface {
		GetByAccountAndName(context.Context, int64, string) (*capability.Capability, error)
	}
	Health capability.HealthObserver
	Risk   interface {
		Apply(context.Context, int64, string, string, map[string]any) error
	}
	Entitlement send.Gate
	Quota       interface {
		ReleaseDaily(context.Context, int64, string) error
		IncrSucceeded(context.Context, int64, string) error
		IncrFailed(context.Context, int64, string) error
	}
	Tx       job.TxManager
	WorkerID string
	LockTTL  time.Duration
	Now      func() time.Time
}

func NewBrowserMux(loader PayloadLoader, deps SessionCheckDeps, log *slog.Logger) *asynq.ServeMux {
	return newMux(loader, &deps, nil, nil, log)
}

func NewInteractiveMux(loader PayloadLoader, deps QRBindDeps, log *slog.Logger) *asynq.ServeMux {
	return newMux(loader, nil, &deps, nil, log)
}

type SendDispatchDeps struct {
	Sends  send.Repository
	Outbox outbox.Outbox
	Tx     job.TxManager
	Tasks  interface {
		GetByID(context.Context, int64) (*task.SparkTask, error)
	}
	Friends interface {
		HasConversation(context.Context, int64, int64) (bool, error)
	}
	Resolver interface {
		Resolve(context.Context, int64, capability.ResolveRequest) (capability.Route, error)
	}
	Now func() time.Time
}

type CapabilityProbeDeps struct {
	Snapshots capability.Repository
	Sidecar   sidecar.Client
	Tx        job.TxManager
	Health    capability.HealthObserver
	Adapter   string
	Now       func() time.Time
}

type WechatSubscriptionSender interface {
	SendSubscription(context.Context, wechatinfra.SubscriptionMessage) error
}

type WechatNotificationDeps struct {
	Deliveries notification.DeliveryRepository
	Sender     WechatSubscriptionSender
	TemplateID string
	Page       string
	TitleField string
	BodyField  string
	Now        func() time.Time
}

type LightMuxDeps struct {
	Dispatch SendDispatchDeps
	Probe    CapabilityProbeDeps
	Wechat   WechatNotificationDeps
}

func NewLightMux(loader PayloadLoader, deps LightMuxDeps, log *slog.Logger) *asynq.ServeMux {
	return newMux(loader, nil, nil, &deps, log)
}

func newMux(loader PayloadLoader, sessionDeps *SessionCheckDeps, qrDeps *QRBindDeps, lightDeps *LightMuxDeps, log *slog.Logger) *asynq.ServeMux {
	mux := asynq.NewServeMux()
	for _, kind := range outboxKinds {
		kind := kind
		if kind == asynqqueue.KindAccountBindQR && qrDeps != nil {
			mux.HandleFunc(kind, qrBindHandler(loader, *qrDeps))
			continue
		}
		if kind == asynqqueue.KindAccountBindSMS && qrDeps != nil {
			mux.HandleFunc(kind, smsBindHandler(loader, *qrDeps))
			continue
		}
		if kind == asynqqueue.KindSessionCheckBrowser && sessionDeps != nil {
			mux.HandleFunc(kind, sessionCheckHandler(loader, *sessionDeps, log))
			continue
		}
		if kind == asynqqueue.KindFriendsSyncBrowser && sessionDeps != nil && sessionDeps.Friends != nil {
			mux.HandleFunc(kind, friendsSyncHandler(loader, *sessionDeps))
			continue
		}
		if kind == asynqqueue.KindSendDispatch && lightDeps != nil {
			mux.HandleFunc(kind, sendDispatchHandler(loader, lightDeps.Dispatch))
			continue
		}
		if kind == asynqqueue.KindCapabilityProbe && lightDeps != nil && lightDeps.Probe.Snapshots != nil && lightDeps.Probe.Sidecar != nil && lightDeps.Probe.Tx != nil {
			mux.HandleFunc(kind, capabilityProbeHandler(loader, lightDeps.Probe))
			continue
		}
		if kind == asynqqueue.KindNotificationWechat && lightDeps != nil && lightDeps.Wechat.Deliveries != nil {
			mux.HandleFunc(kind, wechatNotificationHandler(loader, lightDeps.Wechat))
			continue
		}
		if kind == asynqqueue.KindSendBrowser && sessionDeps != nil && sessionDeps.Sends != nil {
			mux.HandleFunc(kind, sendBrowserHandler(loader, *sessionDeps))
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
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
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
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
			return err
		}
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
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, code, deps.Now)
			if deps.Risk != nil {
				observeWorkerRisk(ctx, deps.Risk, acct.ID, code, capability.AdapterBrowserConsumer, claimed.PublicID.String())
			} else if code == apperr.CodeSessionExpired {
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
				if deps.Risk != nil {
					observeWorkerRisk(ctx, deps.Risk, acct.ID, apperr.CodeSessionExpired, capability.AdapterBrowserConsumer, claimed.PublicID.String())
				} else {
					_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionExpired, deps.Now())
				}
				return fail(apperr.CodeSessionExpired)
			case sidecar.ErrChallengeRequired:
				if deps.Risk != nil {
					observeWorkerRisk(ctx, deps.Risk, acct.ID, apperr.CodeChallengeRequired, capability.AdapterBrowserConsumer, claimed.PublicID.String())
				} else {
					_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionChallengeRequired, deps.Now())
				}
				return fail(apperr.CodeChallengeRequired)
			default:
				observeWorkerRisk(ctx, deps.Risk, acct.ID, code, capability.AdapterBrowserConsumer, claimed.PublicID.String())
				observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, code, deps.Now)
				return fail(code)
			}
		}
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
			return err
		}
		var result struct {
			Valid bool `json:"valid"`
		}
		body, err := json.Marshal(response.Result)
		if err != nil || json.Unmarshal(body, &result) != nil || !result.Valid {
			observeWorkerRisk(ctx, deps.Risk, acct.ID, apperr.CodeAdapterIncompatible, capability.AdapterBrowserConsumer, claimed.PublicID.String())
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, deps.Now)
			return fail(apperr.CodeAdapterIncompatible)
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
