package asynqworker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/redislock"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

type sendTextResult struct {
	Confirmed         bool   `json:"confirmed"`
	PlatformMessageID string `json:"platform_message_id"`
}

func sendBrowserHandler(loader PayloadLoader, deps SessionCheckDeps) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, t *asynq.Task) error {
		var envelope struct {
			OutboxID string `json:"outbox_id"`
		}
		if err := json.Unmarshal(t.Payload(), &envelope); err != nil || envelope.OutboxID == "" {
			return fmt.Errorf("send browser: invalid outbox payload")
		}
		message, err := loader.FetchByPublicID(ctx, envelope.OutboxID)
		if err != nil {
			return fmt.Errorf("send browser: load outbox: %w", err)
		}
		var ref struct {
			JobID string `json:"job_id"`
		}
		if err := json.Unmarshal(message.Payload, &ref); err != nil {
			return fmt.Errorf("send browser: invalid job payload: %w", err)
		}
		jobPublicID, err := uuid.Parse(ref.JobID)
		if err != nil {
			return fmt.Errorf("send browser: invalid job id: %w", err)
		}
		now := deps.Now
		if now == nil {
			now = time.Now
		}
		if deps.LockTTL <= 0 {
			deps.LockTTL = 2 * time.Minute
		}
		if deps.Sends == nil || deps.Tasks == nil || deps.Targets == nil || deps.Tx == nil {
			return fmt.Errorf("send browser: dependencies are not configured")
		}
		claimed, err := deps.Sends.ClaimJob(ctx, jobPublicID, deps.WorkerID, deps.LockTTL)
		if err != nil || claimed == nil {
			return err
		}
		intent, err := deps.Sends.GetIntentByID(ctx, claimed.IntentID)
		if err != nil {
			return finishSend(ctx, deps, claimed, send.JobFailed, apperr.CodeInternal, false, nil, send.IntentFailed, now)
		}
		fail := func(code string) error {
			return finishSend(ctx, deps, claimed, send.JobFailed, code, false, nil, send.IntentFailed, now)
		}
		if err := deps.Sends.SetIntentStatus(ctx, intent.ID, send.IntentRunning, nil, nil, now()); err != nil {
			return fail(apperr.CodeInternal)
		}
		if deps.Accounts == nil || deps.Sessions == nil || deps.Sidecar == nil || deps.Redis == nil || deps.Entitlement == nil {
			return fail(apperr.CodeInternal)
		}
		acct, err := deps.Accounts.GetByID(ctx, claimed.AccountID)
		if err != nil || intent.AccountID != claimed.AccountID {
			return fail(apperr.CodeNotFound)
		}
		if deps.Quota == nil {
			return fail(apperr.CodeInternal)
		}
		failWithQuota := func(code string) error {
			return finishSendWithQuota(ctx, deps, claimed, send.JobFailed, code, false, nil, send.IntentFailed,
				acct.UserID, intent.LocalDate, now)
		}
		if acct.BindingStatus != account.BindingBound {
			return failWithQuota(apperr.CodeConflict)
		}
		if acct.SessionStatus == account.SessionExpired {
			return failWithQuota(apperr.CodeSessionExpired)
		}
		if acct.SessionStatus == account.SessionChallengeRequired {
			return failWithQuota(apperr.CodeChallengeRequired)
		}
		if deps.Capabilities != nil {
			snapshot, capabilityErr := deps.Capabilities.GetByAccountAndName(ctx, acct.ID, capability.NameMessageTextExisting)
			if capabilityErr != nil {
				return failWithQuota(apperr.CodeInternal)
			}
			if snapshot == nil || snapshot.Status != capability.StatusAvailable {
				return failWithQuota(capabilitySendError(snapshot))
			}
			adapter := capability.AdapterBrowserConsumer
			if snapshot.Adapter != nil && *snapshot.Adapter != "" {
				adapter = *snapshot.Adapter
			}
			if deps.Health != nil {
				allowed, healthErr := deps.Health.Allow(ctx, adapter)
				if healthErr != nil {
					return failWithQuota(apperr.CodeInternal)
				}
				if !allowed {
					return failWithQuota(apperr.CodeAdapterUnavailable)
				}
			}
		}
		decision, err := deps.Entitlement.Authorize(ctx, entitlement.AuthorizationRequest{
			UserID: acct.UserID, Action: entitlement.ActionSendExecute,
		})
		if err != nil {
			return failWithQuota(apperr.CodeInternal)
		}
		if !decision.Allowed {
			return failWithQuota(decision.ReasonCode)
		}
		lock, err := redislock.Acquire(ctx, deps.Redis, "lock:account:"+fmt.Sprint(acct.ID), claimed.PublicID.String(), deps.LockTTL)
		if err != nil {
			return failWithQuota(apperr.CodeAccountBusy)
		}
		defer func() { _ = lock.Release(context.Background()) }()
		if intent.TaskID == nil {
			return failWithQuota(apperr.CodeAdapterIncompatible)
		}
		tk, err := deps.Tasks.GetByID(ctx, *intent.TaskID)
		if err != nil || tk.AccountID != claimed.AccountID || tk.FriendID != claimed.FriendID || tk.MessageKind != "text" || tk.MessageBody == nil || strings.TrimSpace(*tk.MessageBody) == "" {
			return failWithQuota(apperr.CodeAdapterIncompatible)
		}
		target, err := deps.Targets.GetSendTarget(ctx, claimed.AccountID, claimed.FriendID)
		if err != nil {
			code := apperr.CodeAdapterIncompatible
			if app, ok := apperr.As(err); ok {
				code = app.Code
			}
			return failWithQuota(code)
		}
		var response *sidecar.Response
		err = deps.Sessions.WithTempFile(ctx, acct.ID, acct.UserPublicID, acct.PublicID, func(path string) error {
			response, err = deps.Sidecar.Call(ctx, sidecar.Request{
				ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
				Op: sidecar.OpsMessageSendText, DeadlineMS: 30_000,
				Input: map[string]any{
					"session": map[string]any{"kind": "playwright_storage_state_file", "path": path},
					"target":  map[string]string{"platform_user_id": target.PlatformUserID, "platform_conversation_id": target.PlatformConversationID},
					"message": map[string]string{"text": *tk.MessageBody},
				},
			})
			return err
		})
		if err != nil {
			if errors.Is(err, sidecar.ErrProcessStart) {
				nextAttemptAt := now().Add(sendRetryDelay(claimed.Attempt))
				return finishSendRetry(ctx, deps, claimed, apperr.CodeAdapterUnavailable, nextAttemptAt, now)
			}
			if app, ok := apperr.As(err); ok && app.Code == apperr.CodeSessionExpired {
				_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionExpired, now())
				return failWithQuota(apperr.CodeSessionExpired)
			}
			return failWithQuota(apperr.CodeAdapterUnavailable)
		}
		if code := sendSidecarErrorCode(response); code != "" {
			mapped := mapSendSidecarError(code)
			if deps.Health != nil && capability.IsCircuitFailureCode(code) {
				_ = deps.Health.ObserveFailure(ctx, capability.AdapterBrowserConsumer, "", code, now())
			}
			if shouldRetrySend(response) {
				nextAttemptAt := now().Add(sendRetryDelay(claimed.Attempt))
				return finishSendRetry(ctx, deps, claimed, mapped, nextAttemptAt, now)
			}
			if mapped == apperr.CodeSessionExpired {
				_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionExpired, now())
			} else if mapped == apperr.CodeChallengeRequired {
				_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionChallengeRequired, now())
			} else if mapped == apperr.CodePlatformRateLimited {
				cooldown := now().Add(10 * time.Minute)
				_ = deps.Accounts.SetRiskStatus(ctx, acct.ID, account.RiskCoolingDown, &cooldown)
			}
			return failWithQuota(mapped)
		}
		var result sendTextResult
		if err := decodeResult(response, &result); err != nil || !result.Confirmed || result.PlatformMessageID == "" {
			if deps.Health != nil {
				_ = deps.Health.ObserveFailure(ctx, capability.AdapterBrowserConsumer, "", sidecar.ErrAdapterIncompatible, now())
			}
			return failWithQuota(apperr.CodeAdapterIncompatible)
		}
		if deps.Health != nil {
			_ = deps.Health.ObserveSuccess(ctx, capability.AdapterBrowserConsumer, "", now())
		}
		messageID := result.PlatformMessageID
		if err := finishSendWithQuota(ctx, deps, claimed, send.JobSucceeded, "", false, &messageID, send.IntentSucceeded,
			acct.UserID, intent.LocalDate, now); err != nil {
			return err
		}
		return nil
	}
}

func capabilitySendError(snapshot *capability.Capability) string {
	if snapshot != nil && snapshot.ErrorCode != nil {
		switch *snapshot.ErrorCode {
		case sidecar.ErrAdapterIncompatible:
			return apperr.CodeAdapterIncompatible
		case sidecar.ErrNetworkTimeout:
			return apperr.CodeNetworkTimeout
		}
	}
	return apperr.CodeAdapterUnavailable
}

func finishSend(ctx context.Context, deps SessionCheckDeps, claimed *send.SendJob, jobStatus send.JobStatus, code string, retryable bool, messageID *string, intentStatus send.IntentStatus, now func() time.Time) error {
	return deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := deps.Sends.FinishJob(tctx, claimed.ID, jobStatus, &code, retryable, messageID, now()); err != nil {
			return err
		}
		return deps.Sends.SetIntentStatus(tctx, claimed.IntentID, intentStatus, &code, nil, now())
	})
}

func finishSendWithQuota(ctx context.Context, deps SessionCheckDeps, claimed *send.SendJob, jobStatus send.JobStatus, code string, retryable bool, messageID *string, intentStatus send.IntentStatus, userID int64, localDate *string, now func() time.Time) error {
	return deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
		var errorCode *string
		if code != "" {
			errorCode = &code
		}
		if err := deps.Sends.FinishJob(tctx, claimed.ID, jobStatus, errorCode, retryable, messageID, now()); err != nil {
			return err
		}
		if err := deps.Sends.SetIntentStatus(tctx, claimed.IntentID, intentStatus, errorCode, nil, now()); err != nil {
			return err
		}
		if jobStatus == send.JobSucceeded {
			if localDate != nil && *localDate != "" {
				if err := deps.Quota.IncrSucceeded(tctx, userID, *localDate); err != nil {
					return err
				}
			}
			return deps.Targets.MarkLastSent(tctx, claimed.FriendID, now())
		}
		if localDate == nil || *localDate == "" {
			return nil
		}
		if err := deps.Quota.ReleaseDaily(tctx, userID, *localDate); err != nil {
			return err
		}
		return deps.Quota.IncrFailed(tctx, userID, *localDate)
	})
}

func sendSidecarErrorCode(response *sidecar.Response) string {
	if response != nil && !response.OK && response.Error != nil {
		return response.Error.Code
	}
	if response == nil || !response.OK {
		return sidecar.ErrAdapterUnavailable
	}
	return ""
}

func mapSendSidecarError(code string) string {
	switch code {
	case sidecar.ErrSessionExpired:
		return apperr.CodeSessionExpired
	case sidecar.ErrChallengeRequired:
		return apperr.CodeChallengeRequired
	case sidecar.ErrPlatformRateLimited:
		return apperr.CodePlatformRateLimited
	case sidecar.ErrConversationNotFound:
		return apperr.CodeConversationNotFound
	case sidecar.ErrTargetIdentityMismatch:
		return apperr.CodeTargetIdentityMismatch
	case sidecar.ErrBrowserSelectorChanged, sidecar.ErrAdapterIncompatible:
		return apperr.CodeAdapterIncompatible
	case sidecar.ErrNetworkTimeout:
		return apperr.CodeNetworkTimeout
	default:
		return apperr.CodeAdapterUnavailable
	}
}

// shouldRetrySend trusts the Sidecar's retryable bit only for errors whose
// adapter contract can prove that no platform write was accepted. A timeout
// is conditional: adapters must set retryable=true only when they know the
// request was not submitted; otherwise the result remains fail-closed.
func shouldRetrySend(response *sidecar.Response) bool {
	if response == nil || response.OK || response.Error == nil || !response.Error.Retryable {
		return false
	}
	switch response.Error.Code {
	case sidecar.ErrAdapterUnavailable, sidecar.ErrNetworkTimeout:
		return true
	default:
		return false
	}
}

func sendRetryDelay(attempt int) time.Duration {
	switch attempt {
	case 1:
		return 30 * time.Second
	case 2:
		return 2 * time.Minute
	default:
		return 10 * time.Minute
	}
}

func finishSendRetry(ctx context.Context, deps SessionCheckDeps, claimed *send.SendJob, code string,
	nextAttemptAt time.Time, now func() time.Time) error {
	return deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
		errorCode := code
		if err := deps.Sends.FinishJob(tctx, claimed.ID, send.JobFailed, &errorCode, true, nil, now()); err != nil {
			return err
		}
		return deps.Sends.SetIntentStatus(tctx, claimed.IntentID, send.IntentRetryWait, &errorCode, &nextAttemptAt, now())
	})
}
