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
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

type sendMessageResult struct {
	Confirmed          bool   `json:"confirmed"`
	PlatformMessageID  string `json:"platform_message_id"`
	ConfirmationSource string `json:"confirmation_source"`
}

type messageSendPlan struct {
	Capability string
	Operation  string
	Message    map[string]string
}

// messageSendSpec keeps task payload semantics at the worker boundary. A
// sticker body is a stable platform sticker_id, never a display name or URL.
func messageSendSpec(kind, body string) (messageSendPlan, error) {
	return messageSendSpecForAdapter(kind, body, capability.AdapterBrowserConsumer, false)
}

func messageSendSpecForAdapter(kind, body, adapter string, allowFirstMessage bool) (messageSendPlan, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return messageSendPlan{}, fmt.Errorf("message body is empty")
	}
	switch kind {
	case "text":
		if allowFirstMessage {
			if adapter != capability.AdapterProtocolIM {
				return messageSendPlan{}, fmt.Errorf("first-message tasks require the protocol adapter")
			}
			return messageSendPlan{Capability: capability.NameMessageTextFirst, Operation: sidecar.OpsMessageSendFirst, Message: map[string]string{"text": body}}, nil
		}
		return messageSendPlan{Capability: capability.NameMessageTextExisting, Operation: sidecar.OpsMessageSendText, Message: map[string]string{"text": body}}, nil
	case "sticker":
		return messageSendPlan{Capability: capability.NameMessageSticker, Operation: sidecar.OpsMessageSendSticker, Message: map[string]string{"sticker_id": body}}, nil
	default:
		return messageSendPlan{}, fmt.Errorf("unsupported message kind %q", kind)
	}
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

type adapterCapabilityRepository interface {
	GetByAccountAndNameAndAdapter(context.Context, int64, string, string) (*capability.Capability, error)
}

func capabilityForAdapter(ctx context.Context, repo interface {
	GetByAccountAndName(context.Context, int64, string) (*capability.Capability, error)
}, accountID int64, name, adapter string) (*capability.Capability, error) {
	if adapterRepo, ok := repo.(adapterCapabilityRepository); ok {
		return adapterRepo.GetByAccountAndNameAndAdapter(ctx, accountID, name, adapter)
	}
	// Lightweight test doubles and older integrations can still provide the
	// original lookup; production repositories implement the adapter-specific
	// method above.
	return repo.GetByAccountAndName(ctx, accountID, name)
}

type sendAdapterConfig struct {
	adapter string
	name    string
}

func sendBrowserHandler(loader PayloadLoader, deps SessionCheckDeps) func(context.Context, *asynq.Task) error {
	return sendAdapterHandler(loader, deps, sendAdapterConfig{adapter: capability.AdapterBrowserConsumer, name: "send browser"})
}

func sendProtocolHandler(loader PayloadLoader, deps SessionCheckDeps) func(context.Context, *asynq.Task) error {
	return sendAdapterHandler(loader, deps, sendAdapterConfig{adapter: capability.AdapterProtocolIM, name: "send protocol"})
}

func sendAdapterHandler(loader PayloadLoader, deps SessionCheckDeps, adapterConfig sendAdapterConfig) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, t *asynq.Task) error {
		var envelope struct {
			OutboxID string `json:"outbox_id"`
		}
		if err := json.Unmarshal(t.Payload(), &envelope); err != nil || envelope.OutboxID == "" {
			return fmt.Errorf("%s: invalid outbox payload", adapterConfig.name)
		}
		message, err := loadPendingMessage(ctx, loader, envelope.OutboxID, adapterConfig.name+": load outbox")
		if err != nil {
			return err
		}
		var ref struct {
			JobID string `json:"job_id"`
		}
		if err := json.Unmarshal(message.Payload, &ref); err != nil {
			return fmt.Errorf("%s: invalid job payload: %w", adapterConfig.name, err)
		}
		jobPublicID, err := uuid.Parse(ref.JobID)
		if err != nil {
			return fmt.Errorf("%s: invalid job id: %w", adapterConfig.name, err)
		}
		now := deps.Now
		if now == nil {
			now = time.Now
		}
		if deps.LockTTL <= 0 {
			deps.LockTTL = 2 * time.Minute
		}
		if deps.Sends == nil || deps.Tasks == nil || deps.Targets == nil || deps.Tx == nil {
			return fmt.Errorf("%s: dependencies are not configured", adapterConfig.name)
		}
		if err := validateSendPreflightDependencies(deps); err != nil {
			return fmt.Errorf("%s: %w", adapterConfig.name, err)
		}
		claimed, err := deps.Sends.ClaimJob(ctx, jobPublicID, deps.WorkerID, deps.LockTTL)
		if err != nil {
			return err
		}
		if claimed == nil {
			return fmt.Errorf("%s: claim job returned nil", adapterConfig.name)
		}
		stopHeartbeat := startLeaseHeartbeat(ctx, deps.LockTTL, func(heartbeatCtx context.Context) error {
			return deps.Sends.HeartbeatJob(heartbeatCtx, claimed.ID, deps.WorkerID, deps.LockTTL)
		})
		defer stopHeartbeat()
		intent, err := deps.Sends.GetIntentByID(ctx, claimed.IntentID)
		if err != nil {
			return fmt.Errorf("%s: load intent: %w", adapterConfig.name, err)
		}
		if intent == nil {
			return fmt.Errorf("%s: load intent returned nil", adapterConfig.name)
		}
		if intent.Status.Terminal() {
			return finishTerminalIntentJob(ctx, deps, claimed, intent, now)
		}
		if err := deps.Sends.SetIntentStatus(ctx, intent.ID, send.IntentRunning, nil, nil, now()); err != nil {
			return fmt.Errorf("%s: mark intent running: %w", adapterConfig.name, err)
		}
		if deps.Accounts == nil || deps.Sessions == nil || deps.Sidecar == nil || deps.Redis == nil || deps.Entitlement == nil {
			return fmt.Errorf("%s: execution dependencies are not configured", adapterConfig.name)
		}
		acct, err := deps.Accounts.GetByID(ctx, claimed.AccountID)
		if err != nil {
			return fmt.Errorf("%s: load account: %w", adapterConfig.name, err)
		}
		if acct == nil {
			return fmt.Errorf("%s: load account returned nil", adapterConfig.name)
		}
		if intent.AccountID != claimed.AccountID {
			return fmt.Errorf("%s: account does not match send intent", adapterConfig.name)
		}
		if deps.Quota == nil {
			return fmt.Errorf("%s: quota dependency is not configured", adapterConfig.name)
		}
		failWithQuota := func(code string) error {
			return finishSendWithQuota(ctx, deps, claimed, send.JobFailed, code, false, nil, send.IntentFailed,
				acct.UserID, intent.LocalDate, now, adapterConfig.adapter)
		}
		if code := sendAccountStateError(acct, now()); code != "" {
			return failWithQuota(code)
		}
		if intent.TaskID == nil {
			return failWithQuota(apperr.CodeAdapterIncompatible)
		}
		tk, err := deps.Tasks.GetByID(ctx, *intent.TaskID)
		if err != nil || tk == nil || tk.AccountID != claimed.AccountID || tk.FriendID != claimed.FriendID {
			return failWithQuota(apperr.CodeAdapterIncompatible)
		}
		spec, err := messageSendSpecForAdapter(tk.MessageKind, valueOrEmpty(tk.MessageBody), adapterConfig.adapter, tk.AllowFirstMessage)
		if err != nil {
			return failWithQuota(apperr.CodeAdapterIncompatible)
		}
		snapshot, capabilityErr := capabilityForAdapter(ctx, deps.Capabilities, acct.ID, spec.Capability, adapterConfig.adapter)
		if capabilityErr != nil {
			return failWithQuota(apperr.CodeInternal)
		}
		if snapshot == nil || snapshot.Status != capability.StatusAvailable {
			return failWithQuota(capabilitySendError(snapshot))
		}
		if snapshot.Adapter != nil && *snapshot.Adapter != "" && *snapshot.Adapter != adapterConfig.adapter {
			return failWithQuota(apperr.CodeAdapterIncompatible)
		}
		allowed, healthErr := deps.Health.Allow(ctx, adapterConfig.adapter)
		if healthErr != nil {
			return failWithQuota(apperr.CodeInternal)
		}
		if !allowed {
			return failWithQuota(apperr.CodeAdapterUnavailable)
		}
		decision, err := deps.Entitlement.Authorize(ctx, entitlement.AuthorizationRequest{
			UserID: acct.UserID, Action: entitlement.ActionSendExecute,
			RequiredFeature: requiredTaskFeature(tk.AllowFirstMessage),
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
		defer releaseWorkerLock(ctx, lock, "account")
		latest, err := deps.Accounts.GetByID(ctx, claimed.AccountID)
		if err != nil || latest == nil || latest.UserID != acct.UserID {
			return failWithQuota(apperr.CodeNotFound)
		}
		acct = latest
		if code := sendAccountStateError(acct, now()); code != "" {
			return failWithQuota(code)
		}
		profileDir, err := accountProfileDir(deps.ProfileRoot, acct.PublicID)
		if err != nil {
			return failWithQuota(apperr.CodeInternal)
		}
		target, err := deps.Targets.GetSendTarget(ctx, claimed.AccountID, claimed.FriendID)
		if err != nil || target == nil {
			code := apperr.CodeAdapterIncompatible
			if app, ok := apperr.As(err); ok {
				code = app.Code
			}
			return failWithQuota(code)
		}
		targetInput := map[string]string{"platform_user_id": target.PlatformUserID}
		if spec.Operation != sidecar.OpsMessageSendFirst && target.PlatformConversationID != "" {
			targetInput["platform_conversation_id"] = target.PlatformConversationID
		}
		var response *sidecar.Response
		err = deps.Sessions.WithTempFile(ctx, acct.ID, acct.UserPublicID, acct.PublicID, func(path string) error {
			response, err = deps.Sidecar.Call(ctx, sidecar.Request{
				ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
				Op: spec.Operation, DeadlineMS: 30_000,
				Input: map[string]any{
					"session": map[string]any{"kind": "playwright_storage_state_file", "path": path, "profile_dir": profileDir},
					"target":  targetInput,
					"message": spec.Message,
				},
			})
			return err
		})
		if err != nil {
			if errors.Is(err, sidecar.ErrProcessStart) {
				nextAttemptAt := now().Add(sendRetryDelay(claimed.Attempt))
				return finishSendRetryWithRisk(ctx, deps, claimed, apperr.CodeAdapterUnavailable, nextAttemptAt, now, adapterConfig.adapter, apperr.CodeAdapterUnavailable)
			}
			if app, ok := apperr.As(err); ok && app.Code == apperr.CodeSessionExpired {
				return finishSendWithRiskAndQuota(ctx, deps, claimed, send.JobFailed, apperr.CodeSessionExpired, false, nil, send.IntentFailed,
					acct.UserID, intent.LocalDate, now, adapterConfig.adapter, apperr.CodeSessionExpired, sendRiskFallback(deps, acct.ID, apperr.CodeSessionExpired, now))
			}
			return finishSendWithRiskAndQuota(ctx, deps, claimed, send.JobFailed, apperr.CodeAdapterUnavailable, false, nil, send.IntentFailed,
				acct.UserID, intent.LocalDate, now, adapterConfig.adapter, apperr.CodeAdapterUnavailable, nil)
		}
		if code := sendSidecarErrorCode(response); code != "" {
			mapped := mapSendSidecarError(code)
			observeWorkerHealthFailure(ctx, deps.Health, adapterConfig.adapter, code, now)
			if shouldRetrySend(response) {
				nextAttemptAt := now().Add(sendRetryDelay(claimed.Attempt))
				return finishSendRetryWithRisk(ctx, deps, claimed, mapped, nextAttemptAt, now, adapterConfig.adapter, mapped)
			}
			if !tk.AllowFirstMessage && claimed.Attempt < send.MaxSendAttempts && deps.Outbox != nil &&
				send.CanFallback(adapterConfig.adapter, capability.AdapterBrowserConsumer, code, failureEvidenceFromResponse(response)) {
				available, availabilityErr := browserFallbackAvailable(ctx, deps, acct.ID, spec.Capability)
				if availabilityErr != nil {
					return failWithQuota(apperr.CodeInternal)
				}
				if available {
					return finishSendFallbackWithRisk(ctx, deps, claimed, mapped, now, adapterConfig.adapter, mapped, sendRiskFallback(deps, acct.ID, mapped, now))
				}
			}
			return finishSendWithRiskAndQuota(ctx, deps, claimed, send.JobFailed, mapped, false, nil, send.IntentFailed,
				acct.UserID, intent.LocalDate, now, adapterConfig.adapter, mapped, sendRiskFallback(deps, acct.ID, mapped, now))
		}
		var result sendMessageResult
		if err := decodeResult(response, &result); err != nil || !result.Confirmed || !validMessageConfirmationSource(result.ConfirmationSource) {
			observeWorkerHealthFailure(ctx, deps.Health, adapterConfig.adapter, sidecar.ErrAdapterIncompatible, now)
			return finishSendWithRiskAndQuota(ctx, deps, claimed, send.JobFailed, apperr.CodeAdapterIncompatible, false, nil, send.IntentFailed,
				acct.UserID, intent.LocalDate, now, adapterConfig.adapter, apperr.CodeAdapterIncompatible, nil)
		}
		observeWorkerHealthSuccess(ctx, deps.Health, adapterConfig.adapter, now)
		var messageID *string
		if strings.TrimSpace(result.PlatformMessageID) != "" {
			value := strings.TrimSpace(result.PlatformMessageID)
			messageID = &value
		}
		if err := finishSendWithQuota(ctx, deps, claimed, send.JobSucceeded, "", false, messageID, send.IntentSucceeded,
			acct.UserID, intent.LocalDate, now, adapterConfig.adapter); err != nil {
			return err
		}
		return nil
	}
}

func validMessageConfirmationSource(source string) bool {
	switch strings.TrimSpace(source) {
	case "network_receipt", "browser_visible_message", "browser_message_id":
		return true
	default:
		return false
	}
}

func validateSendPreflightDependencies(deps SessionCheckDeps) error {
	if deps.Capabilities == nil {
		return fmt.Errorf("capability snapshot repository is not configured")
	}
	if deps.Health == nil {
		return fmt.Errorf("adapter health service is not configured")
	}
	return nil
}

func sendAccountStateError(acct *account.Account, now time.Time) string {
	if acct == nil {
		return apperr.CodeNotFound
	}
	if acct.BindingStatus != account.BindingBound {
		return apperr.CodeConflict
	}
	if acct.PausedAt != nil || acct.RiskStatus == account.RiskPaused {
		return apperr.CodeAccountPaused
	}
	if acct.RiskStatus == account.RiskCoolingDown && (acct.CooldownUntil == nil || now.Before(*acct.CooldownUntil)) {
		return apperr.CodeAccountCooldownActive
	}
	if acct.SessionStatus == account.SessionExpired {
		return apperr.CodeSessionExpired
	}
	if acct.SessionStatus == account.SessionChallengeRequired {
		return apperr.CodeChallengeRequired
	}
	return ""
}

func requiredTaskFeature(allowFirstMessage bool) string {
	if allowFirstMessage {
		return entitlement.FeatureCreatorFirstMessage
	}
	return ""
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

func failureEvidenceFromResponse(response *sidecar.Response) send.FailureEvidence {
	if response == nil || response.Error == nil {
		return send.FailureEvidence{}
	}
	evidence := send.FailureEvidence{}
	detail, ok := response.Error.Detail.(map[string]any)
	if !ok {
		return evidence
	}
	if outcome, ok := detail["outcome"].(string); ok {
		evidence.Outcome = send.Outcome(outcome)
	}
	if accepted, ok := detail["platform_write_accepted"].(bool); ok {
		evidence.PlatformWriteAccepted = &accepted
	}
	return evidence
}

func browserFallbackAvailable(ctx context.Context, deps SessionCheckDeps, accountID int64, capabilityName string) (bool, error) {
	if deps.Capabilities == nil {
		return false, nil
	}
	snapshot, err := capabilityForAdapter(ctx, deps.Capabilities, accountID, capabilityName, capability.AdapterBrowserConsumer)
	if err != nil {
		return false, err
	}
	if snapshot == nil || snapshot.Status != capability.StatusAvailable || snapshot.Adapter == nil || *snapshot.Adapter != capability.AdapterBrowserConsumer {
		return false, nil
	}
	if deps.Health == nil {
		return true, nil
	}
	return deps.Health.Allow(ctx, capability.AdapterBrowserConsumer)
}

// finishTerminalIntentJob closes a queued attempt whose intent was finalized
// by another transaction (for example account release). It must not move the
// intent back to running or touch quota a second time.
func finishTerminalIntentJob(ctx context.Context, deps SessionCheckDeps, claimed *send.SendJob, intent *send.SendIntent, now func() time.Time) error {
	return deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
		return deps.Sends.FinishJob(tctx, claimed.ID, send.JobCancelled, intent.ErrorCode, false, nil, now())
	})
}

func finishSendWithQuota(ctx context.Context, deps SessionCheckDeps, claimed *send.SendJob, jobStatus send.JobStatus, code string, retryable bool, messageID *string, intentStatus send.IntentStatus, userID int64, localDate *string, now func() time.Time, adapter string) error {
	return finishSendWithRiskAndQuota(ctx, deps, claimed, jobStatus, code, retryable, messageID, intentStatus,
		userID, localDate, now, adapter, "", nil)
}

func finishSendWithRiskAndQuota(ctx context.Context, deps SessionCheckDeps, claimed *send.SendJob, jobStatus send.JobStatus, code string, retryable bool, messageID *string, intentStatus send.IntentStatus, userID int64, localDate *string, now func() time.Time, adapter, riskCode string, riskFallback func(context.Context) error) error {
	err := deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
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
		if riskCode != "" {
			if deps.Risk != nil {
				if err := applyWorkerRiskInTx(tctx, deps.Risk, claimed.AccountID, riskCode, adapter, claimed.PublicID.String()); err != nil {
					return err
				}
			} else if riskFallback != nil {
				if err := riskFallback(tctx); err != nil {
					return err
				}
			}
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
	if err == nil {
		observeWorkerRiskMetrics(deps.Risk, riskCode)
		observeSendMetric(deps.Metrics, adapter, string(intentStatus))
	}
	return err
}

func observeSendMetric(metrics *telemetry.Metrics, adapter, status string) {
	metrics.AddCounter("send_total", 1, telemetry.Label{Name: "adapter", Value: adapter}, telemetry.Label{Name: "status", Value: status})
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
	evidence := failureEvidenceFromResponse(response)
	if evidence.Outcome == send.OutcomeUnknown || evidence.Outcome == send.OutcomeConfirmed ||
		(evidence.PlatformWriteAccepted != nil && *evidence.PlatformWriteAccepted) {
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
	nextAttemptAt time.Time, now func() time.Time, adapter string) error {
	return finishSendRetryWithRisk(ctx, deps, claimed, code, nextAttemptAt, now, adapter, "")
}

func finishSendRetryWithRisk(ctx context.Context, deps SessionCheckDeps, claimed *send.SendJob, code string,
	nextAttemptAt time.Time, now func() time.Time, adapter, riskCode string) error {
	err := deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
		errorCode := code
		if err := deps.Sends.FinishJob(tctx, claimed.ID, send.JobFailed, &errorCode, true, nil, now()); err != nil {
			return err
		}
		if err := deps.Sends.SetIntentStatus(tctx, claimed.IntentID, send.IntentRetryWait, &errorCode, &nextAttemptAt, now()); err != nil {
			return err
		}
		if riskCode != "" && deps.Risk != nil {
			return applyWorkerRiskInTx(tctx, deps.Risk, claimed.AccountID, riskCode, adapter, claimed.PublicID.String())
		}
		return nil
	})
	if err == nil {
		observeWorkerRiskMetrics(deps.Risk, riskCode)
		observeSendMetric(deps.Metrics, adapter, string(send.IntentRetryWait))
	}
	return err
}

func finishSendFallback(ctx context.Context, deps SessionCheckDeps, claimed *send.SendJob, code string,
	now func() time.Time, adapter string) error {
	return finishSendFallbackWithRisk(ctx, deps, claimed, code, now, adapter, "", nil)
}

func finishSendFallbackWithRisk(ctx context.Context, deps SessionCheckDeps, claimed *send.SendJob, code string,
	now func() time.Time, adapter, riskCode string, riskFallback func(context.Context) error) error {
	if deps.Sends == nil || deps.Outbox == nil || deps.Tx == nil || claimed == nil || claimed.Attempt >= send.MaxSendAttempts {
		return fmt.Errorf("send fallback: dependencies are not configured or attempt limit reached")
	}
	if now == nil {
		now = time.Now
	}
	browser := capability.AdapterBrowserConsumer
	err := deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
		errorCode := code
		if err := deps.Sends.FinishJob(tctx, claimed.ID, send.JobFailed, &errorCode, false, nil, now()); err != nil {
			return err
		}
		if riskCode != "" {
			if deps.Risk != nil {
				if err := applyWorkerRiskInTx(tctx, deps.Risk, claimed.AccountID, riskCode, adapter, claimed.PublicID.String()); err != nil {
					return err
				}
			} else if riskFallback != nil {
				if err := riskFallback(tctx); err != nil {
					return err
				}
			}
		}
		job := &send.SendJob{
			PublicID: uuid.New(), IntentID: claimed.IntentID, AccountID: claimed.AccountID, FriendID: claimed.FriendID,
			Attempt: claimed.Attempt + 1, SelectedAdapter: &browser, Status: send.JobQueued, CreatedAt: now(),
		}
		if err := deps.Sends.CreateJob(tctx, job); err != nil {
			return err
		}
		if err := deps.Sends.SetIntentLastJob(tctx, claimed.IntentID, job.ID); err != nil {
			return err
		}
		if err := deps.Sends.SetIntentStatus(tctx, claimed.IntentID, send.IntentQueued, nil, nil, now()); err != nil {
			return err
		}
		return deps.Outbox.Add(tctx, outboxMessageForSendAdapter(job.PublicID, browser, now()))
	})
	if err == nil {
		observeWorkerRiskMetrics(deps.Risk, riskCode)
		observeSendMetric(deps.Metrics, adapter, string(send.IntentQueued))
	}
	return err
}

func sendRiskFallback(deps SessionCheckDeps, accountID int64, code string, now func() time.Time) func(context.Context) error {
	switch code {
	case apperr.CodeSessionExpired:
		return func(ctx context.Context) error {
			return deps.Accounts.SetSessionStatus(ctx, accountID, account.SessionExpired, now())
		}
	case apperr.CodeChallengeRequired:
		return func(ctx context.Context) error {
			return deps.Accounts.SetSessionStatus(ctx, accountID, account.SessionChallengeRequired, now())
		}
	case apperr.CodePlatformRateLimited:
		return func(ctx context.Context) error {
			cooldown := now().Add(10 * time.Minute)
			return deps.Accounts.SetRiskStatus(ctx, accountID, account.RiskCoolingDown, &cooldown)
		}
	default:
		return nil
	}
}
