package asynqworker

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/redislock"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

type QRBindDeps struct {
	Jobs     job.Repository
	Accounts account.Repository
	Sessions interface {
		Store(context.Context, int64, uuid.UUID, uuid.UUID, []byte) error
		WithTempFile(context.Context, int64, uuid.UUID, uuid.UUID, func(string) error) error
	}
	Sidecar sidecar.Client
	Redis   *redis.Client
	Tx      interface {
		WithinTx(context.Context, func(context.Context) error) error
	}
	Outbox      outbox.Outbox
	WorkerID    string
	ProfileRoot string
	LockTTL     time.Duration
	PollEvery   time.Duration
	Now         func() time.Time
}

type qrStartResult struct {
	LoginHandle string `json:"login_handle"`
	QR          struct {
		Format    string    `json:"format"`
		Value     string    `json:"value"`
		ExpiresAt time.Time `json:"expires_at"`
	} `json:"qr"`
}

type qrPollResult struct {
	State           string `json:"state"`
	SessionExported bool   `json:"session_exported"`
	Identity        struct {
		PlatformUserID string  `json:"platform_user_id"`
		Nickname       string  `json:"nickname"`
		AvatarURL      *string `json:"avatar_url"`
	} `json:"identity"`
}

func qrBindHandler(loader PayloadLoader, deps QRBindDeps) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, t *asynq.Task) error {
		var envelope struct {
			OutboxID string `json:"outbox_id"`
		}
		if err := json.Unmarshal(t.Payload(), &envelope); err != nil || envelope.OutboxID == "" {
			return fmt.Errorf("qr bind: invalid outbox payload")
		}
		message, err := loader.FetchByPublicID(ctx, envelope.OutboxID)
		if err != nil {
			return fmt.Errorf("qr bind: load outbox: %w", err)
		}
		var ref struct {
			JobID string `json:"job_id"`
		}
		if err := json.Unmarshal(message.Payload, &ref); err != nil {
			return fmt.Errorf("qr bind: invalid job payload: %w", err)
		}
		jobID, err := uuid.Parse(ref.JobID)
		if err != nil {
			return fmt.Errorf("qr bind: invalid job id: %w", err)
		}
		if deps.Now == nil {
			deps.Now = time.Now
		}
		if deps.LockTTL <= 0 {
			deps.LockTTL = 6 * time.Minute
		}
		if deps.PollEvery <= 0 {
			deps.PollEvery = 2 * time.Second
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
		profileDir, err := os.MkdirTemp(deps.ProfileRoot, "bind-")
		if err != nil {
			return fail(apperr.CodeInternal)
		}
		defer os.RemoveAll(profileDir)
		exportPath := filepath.Join(profileDir, "session-state.json")

		startResponse, err := deps.Sidecar.Call(ctx, sidecar.Request{
			ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
			Op: sidecar.OpsLoginQRStart, DeadlineMS: 60_000,
			Input: map[string]any{"profile_dir": profileDir, "locale": "zh-CN"},
		})
		if err != nil {
			return fail(apperr.CodeAdapterUnavailable)
		}
		if code := sidecarErrorCode(startResponse); code != "" {
			return fail(mapSidecarError(code))
		}
		var started qrStartResult
		if err := decodeResult(startResponse, &started); err != nil || started.LoginHandle == "" || started.QR.Value == "" {
			return fail(apperr.CodeAdapterIncompatible)
		}
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
			return err
		}
		if err := deps.Jobs.MarkWaiting(ctx, claimed.ID, deps.LockTTL); err != nil {
			return err
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{
			EventType: "qr_ready", Payload: mustJSON(map[string]any{
				"format": started.QR.Format, "value": started.QR.Value, "expires_at": started.QR.ExpiresAt,
			}), CreatedAt: deps.Now(),
		}); err != nil {
			return err
		}

		deadline := started.QR.ExpiresAt
		if deadline.IsZero() {
			deadline = deps.Now().Add(3 * time.Minute)
		}
		lastState := "waiting"
		for deps.Now().Before(deadline) {
			if err := ctx.Err(); err != nil {
				return err
			}
			if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
				return err
			}
			response, callErr := deps.Sidecar.Call(ctx, sidecar.Request{
				ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
				Op: sidecar.OpsLoginQRPoll, DeadlineMS: 10_000,
				Input: map[string]any{"login_handle": started.LoginHandle, "export_session_file": exportPath},
			})
			if callErr != nil {
				return fail(apperr.CodeAdapterUnavailable)
			}
			if code := sidecarErrorCode(response); code != "" {
				return fail(mapSidecarError(code))
			}
			var polled qrPollResult
			if err := decodeResult(response, &polled); err != nil {
				return fail(apperr.CodeAdapterIncompatible)
			}
			if polled.State == "challenge_required" {
				_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionChallengeRequired, deps.Now())
				_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "challenge_required", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()})
				return fail(apperr.CodeChallengeRequired)
			}
			if polled.State == "scanned" && lastState != "scanned" {
				if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "scanned", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()}); err != nil {
					return err
				}
				lastState = "scanned"
			}
			if polled.State == "authenticated" && polled.SessionExported {
				if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
					return err
				}
				return completeQRBind(ctx, deps, claimed, acct, exportPath, polled)
			}
			if polled.State != "waiting" && polled.State != "scanned" {
				return fail(apperr.CodeAdapterIncompatible)
			}
			if err := sleepContext(ctx, deps.PollEvery); err != nil {
				return err
			}
		}
		return fail(apperr.CodeQRExpired)
	}
}

func completeQRBind(ctx context.Context, deps QRBindDeps, claimed *job.Job, acct *account.Account, exportPath string, result qrPollResult) error {
	if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
		return err
	}
	if result.Identity.PlatformUserID == "" {
		return finishQRFailure(ctx, deps, claimed, apperr.CodeAccountIdentityUnresolved)
	}
	if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "confirming", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()}); err != nil {
		return err
	}
	plaintext, err := os.ReadFile(exportPath)
	if err != nil {
		return finishQRFailure(ctx, deps, claimed, apperr.CodeAdapterIncompatible)
	}
	_ = os.Remove(exportPath)
	if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
		return err
	}
	if err := deps.Sessions.Store(ctx, acct.ID, acct.UserPublicID, acct.PublicID, plaintext); err != nil {
		return finishQRFailure(ctx, deps, claimed, apperr.CodeInternal)
	}
	if err := deps.Sessions.WithTempFile(ctx, acct.ID, acct.UserPublicID, acct.PublicID, func(path string) error {
		response, callErr := deps.Sidecar.Call(ctx, sidecar.Request{
			ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
			Op: sidecar.OpsSessionValidate, DeadlineMS: 60_000,
			Input: map[string]any{"session": map[string]any{"kind": "playwright_storage_state_file", "path": path}},
		})
		if callErr != nil {
			return callErr
		}
		if code := sidecarErrorCode(response); code != "" {
			return fmt.Errorf("session validation failed: %s", code)
		}
		var valid struct {
			Valid bool `json:"valid"`
		}
		if err := decodeResult(response, &valid); err != nil || !valid.Valid {
			return fmt.Errorf("session validation returned invalid")
		}
		return nil
	}); err != nil {
		_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionExpired, deps.Now())
		return finishQRFailure(ctx, deps, claimed, apperr.CodeSessionExpired)
	}
	if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, deps.Now); cancelled || err != nil {
		return err
	}
	if deps.Tx == nil || deps.Outbox == nil {
		return finishQRFailure(ctx, deps, claimed, apperr.CodeInternal)
	}
	if err := deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := deps.Accounts.SetIdentity(tctx, acct.ID, result.Identity.PlatformUserID, result.Identity.Nickname, result.Identity.AvatarURL); err != nil {
			return err
		}
		if err := deps.Accounts.SetSessionStatus(tctx, acct.ID, account.SessionValid, deps.Now()); err != nil {
			return err
		}
		if err := deps.Accounts.SetBindingStatus(tctx, acct.ID, account.BindingBound); err != nil {
			return err
		}
		return enqueueInitialFriendsSync(tctx, deps, acct)
	}); err != nil {
		return finishQRFailure(ctx, deps, claimed, apperr.CodeInternal)
	}
	_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "success", Payload: json.RawMessage(`{"binding_status":"bound"}`), CreatedAt: deps.Now()})
	return deps.Jobs.Finish(ctx, claimed.ID, job.StatusSucceeded, nil, deps.Now())
}

func enqueueInitialFriendsSync(ctx context.Context, deps QRBindDeps, acct *account.Account) error {
	userID, accountID := acct.UserID, acct.ID
	friendsJob := &job.Job{
		PublicID: uuid.New(), UserID: &userID, AccountID: &accountID,
		Type: "account.friends_sync.browser", Status: job.StatusQueued,
		Cancelable: false, CreatedAt: deps.Now(),
	}
	if err := deps.Jobs.CreateJob(ctx, friendsJob); err != nil {
		return err
	}
	return deps.Outbox.Add(ctx, outbox.Message{
		Kind: outbox.KindFriendsSyncBrowser, AggregateType: "job",
		AggregateID: friendsJob.PublicID.String(),
		Payload:     mustJSON(map[string]string{"job_id": friendsJob.PublicID.String()}),
		DedupeKey:   "job.platform:" + friendsJob.PublicID.String(),
	})
}

func finishQRFailure(ctx context.Context, deps QRBindDeps, claimed *job.Job, code string) error {
	_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "error", Payload: mustJSON(map[string]string{"code": code}), CreatedAt: deps.Now()})
	return deps.Jobs.Finish(ctx, claimed.ID, job.StatusFailed, &code, deps.Now())
}

func decodeResult(response *sidecar.Response, target any) error {
	if response == nil || !response.OK {
		return fmt.Errorf("sidecar response is not successful")
	}
	body, err := json.Marshal(response.Result)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, target)
}

func sidecarErrorCode(response *sidecar.Response) string {
	if response != nil && !response.OK && response.Error != nil {
		return response.Error.Code
	}
	if response == nil {
		return sidecar.ErrAdapterUnavailable
	}
	if !response.OK {
		return sidecar.ErrAdapterUnavailable
	}
	return ""
}

func mapSidecarError(code string) string {
	switch code {
	case sidecar.ErrQRExpired:
		return apperr.CodeQRExpired
	case sidecar.ErrChallengeRequired:
		return apperr.CodeChallengeRequired
	case sidecar.ErrSessionExpired:
		return apperr.CodeSessionExpired
	case sidecar.ErrAdapterIncompatible:
		return apperr.CodeAdapterIncompatible
	case sidecar.ErrNetworkTimeout:
		return apperr.CodeNetworkTimeout
	default:
		return apperr.CodeAdapterUnavailable
	}
}

func mustJSON(value any) json.RawMessage {
	b, _ := json.Marshal(value)
	return b
}

func sleepContext(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
