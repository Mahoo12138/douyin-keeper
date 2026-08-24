package asynqworker

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/redislock"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

type smsStartResult struct {
	LoginHandle string    `json:"login_handle"`
	ExpiresAt   time.Time `json:"expires_at"`
}

type smsVerifyResult struct {
	State           string       `json:"state"`
	SessionExported bool         `json:"session_exported"`
	Identity        bindIdentity `json:"identity"`
}

func smsStartInput(profileDir, phone string) map[string]any {
	return map[string]any{"profile_dir": profileDir, "phone": strings.TrimSpace(phone), "locale": "zh-CN"}
}

func smsVerifyInput(loginHandle, code, exportPath string) map[string]any {
	return map[string]any{"login_handle": loginHandle, "code": strings.TrimSpace(code), "export_session_file": exportPath}
}

func smsBindHandler(loader PayloadLoader, deps QRBindDeps) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, t *asynq.Task) error {
		var envelope struct {
			OutboxID string `json:"outbox_id"`
		}
		if err := json.Unmarshal(t.Payload(), &envelope); err != nil || envelope.OutboxID == "" {
			return fmt.Errorf("sms bind: invalid outbox payload")
		}
		message, err := loader.FetchByPublicID(ctx, envelope.OutboxID)
		if err != nil {
			return fmt.Errorf("sms bind: load outbox: %w", err)
		}
		var ref struct {
			JobID string `json:"job_id"`
			Phone string `json:"phone"`
		}
		if err := json.Unmarshal(message.Payload, &ref); err != nil || strings.TrimSpace(ref.Phone) == "" {
			return fmt.Errorf("sms bind: invalid job payload")
		}
		jobID, err := uuid.Parse(ref.JobID)
		if err != nil {
			return fmt.Errorf("sms bind: invalid job id: %w", err)
		}
		if deps.Now == nil {
			deps.Now = time.Now
		}
		if deps.LockTTL <= 0 {
			deps.LockTTL = 6 * time.Minute
		}
		if deps.PollEvery <= 0 {
			deps.PollEvery = time.Second
		}
		claimed, err := deps.Jobs.Claim(ctx, jobID, deps.WorkerID, deps.LockTTL)
		if err != nil || claimed == nil {
			return err
		}
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
			return err
		}
		fail := func(code string) error {
			_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{
				EventType: "error", Payload: mustJSON(map[string]string{"code": code}), CreatedAt: deps.Now(),
			})
			return deps.Jobs.Finish(ctx, claimed.ID, job.StatusFailed, &code, deps.Now())
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "started", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()}); err != nil {
			return err
		}
		if claimed.AccountID == nil || claimed.UserID == nil || deps.Accounts == nil || deps.Sessions == nil || deps.Sidecar == nil || deps.Redis == nil {
			return fail(apperr.CodeInternal)
		}
		defer func() { _ = deps.Redis.Del(context.Background(), job.SMSVerificationKey(claimed.PublicID)).Err() }()
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

		if deps.ProfileRoot == "" {
			deps.ProfileRoot = "/tmp/douyin-keeper/login"
		}
		if err := os.MkdirAll(deps.ProfileRoot, 0o700); err != nil {
			return fail(apperr.CodeInternal)
		}
		_ = os.Chmod(deps.ProfileRoot, 0o700)
		profileDir, err := os.MkdirTemp(deps.ProfileRoot, "sms-bind-")
		if err != nil {
			return fail(apperr.CodeInternal)
		}
		defer os.RemoveAll(profileDir)
		exportPath := filepath.Join(profileDir, "session-state.json")

		startResponse, err := deps.Sidecar.Call(ctx, sidecar.Request{
			ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
			Op: sidecar.OpsLoginSMSStart, DeadlineMS: 60_000,
			Input: smsStartInput(profileDir, ref.Phone),
		})
		if err != nil {
			observeWorkerRisk(ctx, deps.Risk, acct.ID, apperr.CodeAdapterUnavailable, capability.AdapterBrowserConsumer, claimed.PublicID.String())
			return fail(apperr.CodeAdapterUnavailable)
		}
		if code := sidecarErrorCode(startResponse); code != "" {
			mapped := mapSidecarError(code)
			observeWorkerRisk(ctx, deps.Risk, acct.ID, mapped, capability.AdapterBrowserConsumer, claimed.PublicID.String())
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, mapped, deps.Now)
			return fail(mapped)
		}
		var started smsStartResult
		if err := decodeResult(startResponse, &started); err != nil || started.LoginHandle == "" {
			observeWorkerRisk(ctx, deps.Risk, acct.ID, apperr.CodeAdapterIncompatible, capability.AdapterBrowserConsumer, claimed.PublicID.String())
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, deps.Now)
			return fail(apperr.CodeAdapterIncompatible)
		}
		if err := deps.Jobs.MarkWaiting(ctx, claimed.ID, deps.LockTTL); err != nil {
			return err
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{
			EventType: "sms_code_required", Payload: mustJSON(map[string]any{"expires_at": started.ExpiresAt}), CreatedAt: deps.Now(),
		}); err != nil {
			return err
		}

		deadline := started.ExpiresAt
		if deadline.IsZero() {
			deadline = deps.Now().Add(5 * time.Minute)
		}
		for deps.Now().Before(deadline) {
			if err := ctx.Err(); err != nil {
				return err
			}
			if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
				return err
			}
			code, getErr := deps.Redis.GetDel(ctx, job.SMSVerificationKey(claimed.PublicID)).Result()
			if getErr != nil && getErr != redis.Nil {
				return fail(apperr.CodeInternal)
			}
			if getErr == redis.Nil || strings.TrimSpace(code) == "" {
				if err := sleepContext(ctx, deps.PollEvery); err != nil {
					return err
				}
				continue
			}
			response, callErr := deps.Sidecar.Call(ctx, sidecar.Request{
				ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
				Op: sidecar.OpsLoginSMSVerify, DeadlineMS: 60_000,
				Input: smsVerifyInput(started.LoginHandle, code, exportPath),
			})
			if callErr != nil {
				observeWorkerRisk(ctx, deps.Risk, acct.ID, apperr.CodeAdapterUnavailable, capability.AdapterBrowserConsumer, claimed.PublicID.String())
				return fail(apperr.CodeAdapterUnavailable)
			}
			if code := sidecarErrorCode(response); code != "" {
				if code == sidecar.ErrSMSCodeInvalid {
					if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "sms_code_invalid", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()}); err != nil {
						return err
					}
					continue
				}
				mapped := mapSidecarError(code)
				if code == sidecar.ErrChallengeRequired {
					if deps.Risk != nil {
						observeWorkerRisk(ctx, deps.Risk, acct.ID, apperr.CodeChallengeRequired, capability.AdapterBrowserConsumer, claimed.PublicID.String())
					} else {
						_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionChallengeRequired, deps.Now())
					}
					_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "challenge_required", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()})
				}
				observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, mapped, deps.Now)
				return fail(mapped)
			}
			var verified smsVerifyResult
			if err := decodeResult(response, &verified); err != nil {
				return fail(apperr.CodeAdapterIncompatible)
			}
			if verified.State == "challenge_required" {
				if deps.Risk != nil {
					observeWorkerRisk(ctx, deps.Risk, acct.ID, apperr.CodeChallengeRequired, capability.AdapterBrowserConsumer, claimed.PublicID.String())
				} else {
					_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionChallengeRequired, deps.Now())
				}
				_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "challenge_required", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()})
				return fail(apperr.CodeChallengeRequired)
			}
			if verified.State == "authenticated" && verified.SessionExported {
				return completeBind(ctx, deps, claimed, acct, exportPath, verified.Identity)
			}
			_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "sms_code_invalid", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()})
		}
		return fail(apperr.CodeSMSExpired)
	}
}
