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
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
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

// NewMux registers fail-closed handlers for every outbox kind. It is kept for
// callers that need a queue surface before wiring real dependencies; an
// unconfigured kind must be retried/alerted instead of being ACKed as success.
func NewMux(loader PayloadLoader, log *slog.Logger) *asynq.ServeMux {
	return newMux(loader, nil, nil, nil, nil, log)
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
	Outbox       outbox.Outbox
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
	Metrics  *telemetry.Metrics
}

func NewBrowserMux(loader PayloadLoader, deps SessionCheckDeps, log *slog.Logger) *asynq.ServeMux {
	return newMux(loader, &deps, nil, nil, deps.Metrics, log)
}

func NewInteractiveMux(loader PayloadLoader, deps QRBindDeps, log *slog.Logger) *asynq.ServeMux {
	return newMux(loader, nil, &deps, nil, deps.Metrics, log)
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
	Metrics   *telemetry.Metrics
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
	Metrics    *telemetry.Metrics
}

type LightMuxDeps struct {
	Metrics  *telemetry.Metrics
	Dispatch SendDispatchDeps
	Probe    CapabilityProbeDeps
	Wechat   WechatNotificationDeps
	Protocol *SessionCheckDeps
}

func NewLightMux(loader PayloadLoader, deps LightMuxDeps, log *slog.Logger) *asynq.ServeMux {
	return newMux(loader, nil, nil, &deps, deps.Metrics, log)
}

func newMux(loader PayloadLoader, sessionDeps *SessionCheckDeps, qrDeps *QRBindDeps, lightDeps *LightMuxDeps, metrics *telemetry.Metrics, log *slog.Logger) *asynq.ServeMux {
	mux := asynq.NewServeMux()
	register := func(kind string, handler func(context.Context, *asynq.Task) error) {
		mux.HandleFunc(kind, instrumentedHandler(kind, handler, metrics))
	}
	for _, kind := range outboxKinds {
		kind := kind
		if kind == asynqqueue.KindAccountBindQR && qrDeps != nil {
			register(kind, qrBindHandler(loader, *qrDeps))
			continue
		}
		if kind == asynqqueue.KindAccountBindSMS && qrDeps != nil {
			register(kind, smsBindHandler(loader, *qrDeps))
			continue
		}
		if kind == asynqqueue.KindSessionCheckBrowser && sessionDeps != nil {
			register(kind, sessionCheckHandler(loader, *sessionDeps, log))
			continue
		}
		if kind == asynqqueue.KindFriendsSyncBrowser && sessionDeps != nil && sessionDeps.Friends != nil {
			register(kind, friendsSyncHandler(loader, *sessionDeps))
			continue
		}
		if kind == asynqqueue.KindSendDispatch && lightDeps != nil {
			register(kind, sendDispatchHandler(loader, lightDeps.Dispatch))
			continue
		}
		if kind == asynqqueue.KindCapabilityProbe && lightDeps != nil && lightDeps.Probe.Snapshots != nil && lightDeps.Probe.Sidecar != nil && lightDeps.Probe.Tx != nil {
			register(kind, capabilityProbeHandler(loader, lightDeps.Probe))
			continue
		}
		if kind == asynqqueue.KindNotificationWechat && lightDeps != nil && lightDeps.Wechat.Deliveries != nil {
			register(kind, wechatNotificationHandler(loader, lightDeps.Wechat))
			continue
		}
		if kind == asynqqueue.KindSendBrowser && sessionDeps != nil && sessionDeps.Sends != nil {
			register(kind, sendBrowserHandler(loader, *sessionDeps))
			continue
		}
		if kind == asynqqueue.KindSendProtocol && lightDeps != nil && lightDeps.Protocol != nil && lightDeps.Protocol.Sends != nil {
			register(kind, sendProtocolHandler(loader, *lightDeps.Protocol))
			continue
		}
		register(kind, unconfiguredHandler(kind))
	}
	return mux
}

func unconfiguredHandler(kind string) func(context.Context, *asynq.Task) error {
	return func(context.Context, *asynq.Task) error {
		return fmt.Errorf("worker handler for %s is not configured", kind)
	}
}

func instrumentedHandler(kind string, handler func(context.Context, *asynq.Task) error, metrics *telemetry.Metrics) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, task *asynq.Task) error {
		started := time.Now()
		err := handler(ctx, task)
		status := "success"
		if err != nil {
			status = "error"
		}
		metrics.AddCounter("job_total", 1, telemetry.Label{Name: "type", Value: kind}, telemetry.Label{Name: "status", Value: status})
		metrics.Observe("job_duration_seconds", time.Since(started).Seconds(), telemetry.Label{Name: "type", Value: kind})
		return err
	}
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
		stopHeartbeat := startLeaseHeartbeat(ctx, deps.LockTTL, func(heartbeatCtx context.Context) error {
			return deps.Jobs.Heartbeat(heartbeatCtx, claimed.ID, deps.WorkerID, deps.LockTTL)
		})
		defer stopHeartbeat()
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
			return err
		}
		fail := func(code string) error {
			_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "error", Payload: json.RawMessage(fmt.Sprintf(`{"code":%q}`, code)), CreatedAt: deps.Now()})
			return deps.Jobs.Finish(ctx, claimed.ID, job.StatusFailed, &code, deps.Now())
		}
		_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "started", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()})
		if claimed.AccountID == nil || claimed.UserID == nil || deps.Sidecar == nil || deps.Redis == nil || deps.Tx == nil {
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
			return finishSessionCheckFailure(ctx, deps, claimed, acct.ID, code)
		}
		if response == nil || !response.OK {
			code := apperr.CodeAdapterUnavailable
			if response != nil && response.Error != nil {
				code = response.Error.Code
			}
			switch code {
			case sidecar.ErrSessionExpired:
				return finishSessionCheckFailure(ctx, deps, claimed, acct.ID, apperr.CodeSessionExpired)
			case sidecar.ErrChallengeRequired:
				return finishSessionCheckFailure(ctx, deps, claimed, acct.ID, apperr.CodeChallengeRequired)
			default:
				observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, code, deps.Now)
				return finishSessionCheckFailure(ctx, deps, claimed, acct.ID, code)
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
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, deps.Now)
			return finishSessionCheckFailure(ctx, deps, claimed, acct.ID, apperr.CodeAdapterIncompatible)
		}
		if err := commitSessionCheckSuccess(ctx, deps.Tx, deps.Jobs, deps.Accounts, claimed, acct.ID, deps.Now); err != nil {
			return fail(apperr.CodeInternal)
		}
		if log != nil {
			log.Info("session check succeeded", "job_public_id", claimed.PublicID, "account_public_id", acct.PublicID)
		}
		return nil
	}
}

func finishSessionCheckFailure(ctx context.Context, deps SessionCheckDeps, claimed *job.Job, accountID int64, code string) error {
	var fallback func(context.Context) error
	switch code {
	case apperr.CodeSessionExpired:
		fallback = func(tctx context.Context) error {
			return deps.Accounts.SetSessionStatus(tctx, accountID, account.SessionExpired, deps.Now())
		}
	case apperr.CodeChallengeRequired:
		fallback = func(tctx context.Context) error {
			return deps.Accounts.SetSessionStatus(tctx, accountID, account.SessionChallengeRequired, deps.Now())
		}
	}
	return commitWorkerFailure(ctx, deps.Tx, deps.Jobs, deps.Risk, claimed, accountID, code,
		capability.AdapterBrowserConsumer, claimed.PublicID.String(), fallback, deps.Now)
}

// commitSessionCheckSuccess keeps the account's valid-session projection and
// the Job success terminal state in one transaction. Finish is intentionally
// first so an expired lease cannot be followed by a stale session write.
func commitSessionCheckSuccess(
	ctx context.Context,
	tx job.TxManager,
	j job.Repository,
	accounts account.Repository,
	claimed *job.Job,
	accountID int64,
	now func() time.Time,
) error {
	return tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := j.Finish(tctx, claimed.ID, job.StatusSucceeded, nil, now()); err != nil {
			return err
		}
		if err := accounts.SetSessionStatus(tctx, accountID, account.SessionValid, now()); err != nil {
			return err
		}
		return j.AppendEvent(tctx, claimed.ID, job.JobEvent{
			EventType: "success", Payload: json.RawMessage(`{"valid":true}`), CreatedAt: now(),
		})
	})
}

// ServerConfig maps a worker pool to its queues (docs/15 §18).
func ServerConfig(pool string, browserConcurrency ...int) map[string]int {
	switch pool {
	case "interactive":
		return map[string]int{asynqqueue.QueueInteractive: 2}
	case "browser":
		concurrency := 3
		if len(browserConcurrency) > 0 && browserConcurrency[0] > 0 {
			concurrency = browserConcurrency[0]
		}
		return map[string]int{asynqqueue.QueueBrowser: concurrency}
	default: // light
		return map[string]int{asynqqueue.QueueLight: 8}
	}
}
