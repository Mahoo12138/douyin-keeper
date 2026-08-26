package asynqworker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/conversation"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/redislock"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

type platformArchiveResult struct {
	Confirmed              bool   `json:"confirmed"`
	PlatformConversationID string `json:"platform_conversation_id"`
	Archived               bool   `json:"archived"`
}

type platformArchiveIncompatibleError struct {
	cause error
}

func (e platformArchiveIncompatibleError) Error() string {
	return "platform archive result is incompatible"
}
func (e platformArchiveIncompatibleError) Unwrap() error { return e.cause }

func platformArchiveHandler(loader PayloadLoader, deps SessionCheckDeps) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, t *asynq.Task) error {
		var envelope struct {
			OutboxID string `json:"outbox_id"`
		}
		if err := json.Unmarshal(t.Payload(), &envelope); err != nil || envelope.OutboxID == "" {
			return fmt.Errorf("platform archive: invalid outbox payload")
		}
		message, err := loadPendingMessage(ctx, loader, envelope.OutboxID, "platform archive: load outbox")
		if err != nil {
			return err
		}
		var payload conversation.PlatformArchiveJobPayload
		if err := json.Unmarshal(message.Payload, &payload); err != nil {
			return fmt.Errorf("platform archive: invalid job payload: %w", err)
		}
		jobID, err := uuid.Parse(payload.JobID)
		if err != nil || jobID == uuid.Nil {
			return fmt.Errorf("platform archive: invalid job id")
		}
		if payload.AccountID <= 0 || payload.ConversationID <= 0 || payload.PlatformConversationID == "" {
			return fmt.Errorf("platform archive: incomplete target")
		}

		now := deps.Now
		if now == nil {
			now = time.Now
		}
		lockTTL := deps.LockTTL
		if lockTTL <= 0 {
			lockTTL = 5 * time.Minute
		}
		if deps.Jobs == nil {
			return fmt.Errorf("platform archive: jobs repository is not configured")
		}
		claimed, err := deps.Jobs.Claim(ctx, jobID, deps.WorkerID, lockTTL)
		if err != nil {
			return err
		}
		if claimed == nil {
			return fmt.Errorf("platform archive: claim job returned nil")
		}
		stopHeartbeat := startLeaseHeartbeat(ctx, lockTTL, func(heartbeatCtx context.Context) error {
			return deps.Jobs.Heartbeat(heartbeatCtx, claimed.ID, deps.WorkerID, lockTTL)
		})
		defer stopHeartbeat()

		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, now); cancelled || err != nil {
			return err
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "started", Payload: json.RawMessage(`{}`), CreatedAt: now()}); err != nil {
			return err
		}
		fail := func(code string) error {
			return finishPlatformArchiveFailure(ctx, deps, claimed, code, now)
		}
		if claimed.AccountID == nil || claimed.UserID == nil || *claimed.AccountID != payload.AccountID || deps.Accounts == nil || deps.Sessions == nil || deps.Sidecar == nil || deps.Redis == nil || deps.Tx == nil {
			return fail(apperr.CodeInternal)
		}
		if err := requireAdapterAccess(ctx, deps.Health, capability.AdapterBrowserConsumer); err != nil {
			return fail(adapterGateCode(err))
		}
		acct, err := deps.Accounts.GetByID(ctx, *claimed.AccountID)
		if err != nil || acct == nil || acct.UserID != *claimed.UserID {
			return fail(apperr.CodeNotFound)
		}
		lock, err := redislock.Acquire(ctx, deps.Redis, "lock:account:"+fmt.Sprint(acct.ID), claimed.PublicID.String(), lockTTL)
		if err != nil {
			return fail(apperr.CodeAccountBusy)
		}
		defer releaseWorkerLock(ctx, lock, "account")
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, now); cancelled || err != nil {
			return err
		}

		var result platformArchiveResult
		err = deps.Sessions.WithTempFile(ctx, acct.ID, acct.UserPublicID, acct.PublicID, func(path string) error {
			response, callErr := deps.Sidecar.Call(ctx, sidecar.Request{
				ProtocolVersion: sidecar.ProtocolVersion,
				RequestID:       uuid.New().String(),
				Op:              sidecar.OpsConversationsArchive,
				DeadlineMS:      120_000,
				Input: map[string]any{
					"session": map[string]any{"kind": "playwright_storage_state_file", "path": path},
					"target": map[string]any{
						"platform_conversation_id": payload.PlatformConversationID,
						"platform_user_id":         payload.PlatformUserID,
					},
					"archived": payload.Archived,
				},
			})
			if callErr != nil {
				return callErr
			}
			if code := sidecarErrorCode(response); code != "" {
				return newSidecarCodeError(code)
			}
			if err := decodeResult(response, &result); err != nil {
				return platformArchiveIncompatibleError{cause: err}
			}
			return validatePlatformArchiveResult(result, payload.PlatformConversationID, payload.Archived)
		})
		if err != nil {
			code := apperr.CodeAdapterUnavailable
			if responseCode, ok := sidecarResponseCode(err); ok {
				code = mapPlatformArchiveSidecarError(responseCode)
			} else {
				var incompatible platformArchiveIncompatibleError
				if errors.As(err, &incompatible) {
					code = apperr.CodeAdapterIncompatible
				}
			}
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, code, now)
			return fail(code)
		}
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, now); cancelled || err != nil {
			return err
		}
		return commitPlatformArchiveSuccess(ctx, deps, claimed, payload.Archived, now)
	}
}

func validatePlatformArchiveResult(result platformArchiveResult, expectedID string, archived bool) error {
	if !result.Confirmed {
		return platformArchiveIncompatibleError{cause: fmt.Errorf("platform archive result was not confirmed")}
	}
	if result.PlatformConversationID != expectedID || result.Archived != archived {
		return platformArchiveIncompatibleError{cause: fmt.Errorf("platform archive result does not match request")}
	}
	return nil
}

func mapPlatformArchiveSidecarError(code string) string {
	switch code {
	case sidecar.ErrSessionExpired:
		return apperr.CodeSessionExpired
	case sidecar.ErrChallengeRequired:
		return apperr.CodeChallengeRequired
	case sidecar.ErrPlatformRateLimited:
		return apperr.CodePlatformRateLimited
	case sidecar.ErrTargetIdentityMismatch:
		return apperr.CodeTargetIdentityMismatch
	case sidecar.ErrConversationNotFound:
		return apperr.CodeConversationNotFound
	case sidecar.ErrBrowserSelectorChanged:
		return apperr.CodeBrowserSelectorChanged
	case sidecar.ErrNetworkTimeout:
		return apperr.CodeNetworkTimeout
	case sidecar.ErrAdapterIncompatible:
		return apperr.CodeAdapterIncompatible
	default:
		return apperr.CodeAdapterUnavailable
	}
}

func finishPlatformArchiveFailure(ctx context.Context, deps SessionCheckDeps, claimed *job.Job, code string, now func() time.Time) error {
	if deps.Tx == nil {
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "error", Payload: mustJSON(map[string]string{"code": code}), CreatedAt: now()}); err != nil {
			return err
		}
		return deps.Jobs.Finish(ctx, claimed.ID, job.StatusFailed, &code, now())
	}
	return deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := deps.Jobs.Finish(tctx, claimed.ID, job.StatusFailed, &code, now()); err != nil {
			return err
		}
		return deps.Jobs.AppendEvent(tctx, claimed.ID, job.JobEvent{EventType: "error", Payload: mustJSON(map[string]string{"code": code}), CreatedAt: now()})
	})
}

func commitPlatformArchiveSuccess(ctx context.Context, deps SessionCheckDeps, claimed *job.Job, archived bool, now func() time.Time) error {
	return deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := deps.Jobs.Finish(tctx, claimed.ID, job.StatusSucceeded, nil, now()); err != nil {
			return err
		}
		// Keep platform identifiers out of the public Job event stream. The local
		// conversation index is intentionally unchanged until a separate product
		// decision defines how platform and local archive states relate.
		return deps.Jobs.AppendEvent(tctx, claimed.ID, job.JobEvent{EventType: "success", Payload: mustJSON(map[string]bool{"archived": archived}), CreatedAt: now()})
	})
}
