package asynqworker

import (
	"context"
	"encoding/json"
	"errors"
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
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

type QRBindDeps struct {
	Jobs     job.Repository
	Accounts account.Repository
	Sessions interface {
		StoreInTx(context.Context, int64, uuid.UUID, uuid.UUID, []byte) error
	}
	Sidecar sidecar.Client
	Health  capability.HealthObserver
	Risk    interface {
		Apply(context.Context, int64, string, string, map[string]any) error
	}
	Redis *redis.Client
	Tx    interface {
		WithinTx(context.Context, func(context.Context) error) error
	}
	Outbox      outbox.Outbox
	WorkerID    string
	ProfileRoot string
	LockTTL     time.Duration
	PollEvery   time.Duration
	Now         func() time.Time
	Metrics     *telemetry.Metrics
}

type qrStartResult struct {
	State       string `json:"state"`
	LoginHandle string `json:"login_handle"`
	QR          struct {
		Format    string    `json:"format"`
		Value     string    `json:"value"`
		ExpiresAt time.Time `json:"expires_at"`
	} `json:"qr"`
}

type qrPollResult struct {
	State           string       `json:"state"`
	SessionExported bool         `json:"session_exported"`
	Identity        bindIdentity `json:"identity"`
}

type bindIdentity struct {
	PlatformUserID string  `json:"platform_user_id"`
	Nickname       string  `json:"nickname"`
	AvatarURL      *string `json:"avatar_url"`
}

func cancelQRSession(client sidecar.Client, loginHandle string) {
	if client == nil || loginHandle == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = client.Call(ctx, sidecar.Request{
		ProtocolVersion: sidecar.ProtocolVersion,
		RequestID:       uuid.New().String(),
		Op:              sidecar.OpsLoginQRCancel,
		DeadlineMS:      5_000,
		Input:           map[string]any{"login_handle": loginHandle},
	})
}

type resettableSidecar interface {
	sidecar.Client
	Close() error
}

func startQRWithRecovery(ctx context.Context, client sidecar.Client, request sidecar.Request) (*sidecar.Response, error) {
	response, err := client.Call(ctx, request)
	if err != nil || sidecarErrorCode(response) != sidecar.ErrInternal {
		return response, err
	}
	resetter, ok := client.(resettableSidecar)
	if !ok {
		return response, err
	}
	_ = resetter.Close()
	return client.Call(ctx, request)
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
		stopHeartbeat := startLeaseHeartbeat(ctx, deps.LockTTL, func(heartbeatCtx context.Context) error {
			return deps.Jobs.Heartbeat(heartbeatCtx, claimed.ID, deps.WorkerID, deps.LockTTL)
		})
		defer stopHeartbeat()
		if cancelled, err := cancelIfRequestedWithCleanup(ctx, deps.Jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed)); cancelled || err != nil {
			return err
		}
		fail := func(code string) error {
			return finishBindFailure(ctx, deps, claimed, code)
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
		if cancelled, err := cancelIfRequestedWithCleanup(ctx, deps.Jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed)); cancelled || err != nil {
			return err
		}

		profileRoot, err := prepareProfileRoot(deps.ProfileRoot)
		if err != nil {
			return fail(apperr.CodeInternal)
		}
		profileDir, err := os.MkdirTemp(profileRoot, "bind-")
		if err != nil {
			return fail(apperr.CodeInternal)
		}
		defer os.RemoveAll(profileDir)
		exportPath := filepath.Join(profileDir, "session-state.json")

		var startResponse *sidecar.Response
		cancelled, callErr := callIfNotCancelledWithCleanup(ctx, deps.Jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed), func() error {
			var callErr error
			startResponse, callErr = startQRWithRecovery(ctx, deps.Sidecar, sidecar.Request{
				ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
				Op: sidecar.OpsLoginQRStart, DeadlineMS: 60_000,
				Input: map[string]any{"profile_dir": profileDir, "locale": "zh-CN"},
			})
			return callErr
		})
		if cancelled {
			return callErr
		}
		err = callErr
		if err != nil {
			return finishBindRiskFailure(ctx, deps, claimed, acct.ID, apperr.CodeAdapterUnavailable)
		}
		if code := sidecarErrorCode(startResponse); code != "" {
			mapped := mapSidecarError(code)
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, mapped, deps.Now)
			return finishBindRiskFailure(ctx, deps, claimed, acct.ID, mapped)
		}
		var started qrStartResult
		if err := decodeResult(startResponse, &started); err != nil || started.LoginHandle == "" || (started.State != "challenge_required" && started.QR.Value == "") {
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, deps.Now)
			return finishBindRiskFailure(ctx, deps, claimed, acct.ID, apperr.CodeAdapterIncompatible)
		}
		defer cancelQRSession(deps.Sidecar, started.LoginHandle)
		if cancelled, err := cancelIfRequestedWithCleanup(ctx, deps.Jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed)); cancelled || err != nil {
			return err
		}
		if err := deps.Jobs.MarkWaiting(ctx, claimed.ID, deps.LockTTL); err != nil {
			return err
		}
		lastState := "waiting"
		if started.State == "challenge_required" {
			lastState = "challenge_required"
			if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{
				EventType: "platform_challenge", Payload: mustJSON(map[string]any{
					"code": apperr.CodeChallengeRequired, "recoverable": true,
				}), CreatedAt: deps.Now(),
			}); err != nil {
				return err
			}
		} else if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{
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
		for deps.Now().Before(deadline) {
			if err := ctx.Err(); err != nil {
				return err
			}
			if cancelled, err := cancelIfRequestedWithCleanup(ctx, deps.Jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed)); cancelled || err != nil {
				return err
			}
			var response *sidecar.Response
			cancelled, callErr := callIfNotCancelledWithCleanup(ctx, deps.Jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed), func() error {
				var err error
				response, err = deps.Sidecar.Call(ctx, sidecar.Request{
					ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
					Op: sidecar.OpsLoginQRPoll, DeadlineMS: 10_000,
					Input: map[string]any{"login_handle": started.LoginHandle, "export_session_file": exportPath},
				})
				return err
			})
			if cancelled {
				return callErr
			}
			if callErr != nil {
				return finishBindRiskFailure(ctx, deps, claimed, acct.ID, apperr.CodeAdapterUnavailable)
			}
			if code := sidecarErrorCode(response); code != "" {
				mapped := mapSidecarError(code)
				observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, mapped, deps.Now)
				return finishBindRiskFailure(ctx, deps, claimed, acct.ID, mapped)
			}
			var polled qrPollResult
			if err := decodeResult(response, &polled); err != nil {
				observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, deps.Now)
				return finishBindRiskFailure(ctx, deps, claimed, acct.ID, apperr.CodeAdapterIncompatible)
			}
			if polled.State == "challenge_required" {
				if lastState != "challenge_required" {
					if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{
						EventType: "platform_challenge", Payload: mustJSON(map[string]any{
							"code": apperr.CodeChallengeRequired, "recoverable": true,
						}), CreatedAt: deps.Now(),
					}); err != nil {
						return err
					}
					lastState = "challenge_required"
				}
				if err := sleepContext(ctx, deps.PollEvery); err != nil {
					return err
				}
				continue
			}
			if polled.State == "scanned" && lastState != "scanned" {
				if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "scanned", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()}); err != nil {
					return err
				}
				lastState = "scanned"
			}
			if polled.State == "authenticated" && polled.SessionExported {
				if cancelled, err := cancelIfRequestedWithCleanup(ctx, deps.Jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed)); cancelled || err != nil {
					return err
				}
				return completeQRBind(ctx, deps, claimed, acct, exportPath, polled)
			}
			if polled.State != "waiting" && polled.State != "scanned" {
				observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, deps.Now)
				return finishBindRiskFailure(ctx, deps, claimed, acct.ID, apperr.CodeAdapterIncompatible)
			}
			if err := sleepContext(ctx, deps.PollEvery); err != nil {
				return err
			}
		}
		return fail(apperr.CodeQRExpired)
	}
}

func completeQRBind(ctx context.Context, deps QRBindDeps, claimed *job.Job, acct *account.Account, exportPath string, result qrPollResult) error {
	return completeBind(ctx, deps, claimed, acct, exportPath, result.Identity)
}

func completeBind(ctx context.Context, deps QRBindDeps, claimed *job.Job, acct *account.Account, exportPath string, identity bindIdentity) error {
	if cancelled, err := cancelIfRequestedWithCleanup(ctx, deps.Jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed)); cancelled || err != nil {
		return err
	}
	if identity.PlatformUserID == "" {
		return finishBindFailure(ctx, deps, claimed, apperr.CodeAccountIdentityUnresolved)
	}
	if isRebindJob(claimed) && !rebindIdentityMatches(acct, identity) {
		return finishBindFailure(ctx, deps, claimed, apperr.CodeAccountIdentityMismatch)
	}
	if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "confirming", Payload: json.RawMessage(`{}`), CreatedAt: deps.Now()}); err != nil {
		return err
	}
	plaintext, err := os.ReadFile(exportPath)
	if err != nil {
		return finishBindFailure(ctx, deps, claimed, apperr.CodeAdapterIncompatible)
	}
	if cancelled, err := cancelIfRequestedWithCleanup(ctx, deps.Jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed)); cancelled || err != nil {
		return err
	}
	var validationCancelled bool
	validationErr := func() error {
		cancelled, callErr := callIfNotCancelledWithCleanup(ctx, deps.Jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed), func() error {
			response, err := deps.Sidecar.Call(ctx, sidecar.Request{
				ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
				Op: sidecar.OpsSessionValidate, DeadlineMS: 60_000,
				Input: map[string]any{"session": map[string]any{"kind": "playwright_storage_state_file", "path": exportPath}},
			})
			if err != nil {
				return err
			}
			if code := sidecarErrorCode(response); code != "" {
				return newSidecarCodeError(code)
			}
			var valid struct {
				Valid bool `json:"valid"`
			}
			if err := decodeResult(response, &valid); err != nil || !valid.Valid {
				return qrValidationError{}
			}
			return nil
		})
		validationCancelled = cancelled
		if cancelled && callErr == nil {
			return errCancellationConsumed
		}
		return callErr
	}()
	if validationCancelled {
		if errors.Is(validationErr, errCancellationConsumed) {
			return nil
		}
		return validationErr
	}
	if validationErr != nil {
		err := validationErr
		code := apperr.CodeAdapterUnavailable
		if _, ok := err.(qrValidationError); ok {
			code = apperr.CodeAdapterIncompatible
		}
		if responseCode, ok := sidecarResponseCode(err); ok {
			code = mapSidecarError(responseCode)
		}
		if app, ok := apperr.As(err); ok {
			code = app.Code
		}
		observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, code, deps.Now)
		return finishBindRiskFailure(ctx, deps, claimed, acct.ID, code)
	}
	if cancelled, err := cancelIfRequestedWithCleanup(ctx, deps.Jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed)); cancelled || err != nil {
		return err
	}
	if deps.Tx == nil || deps.Outbox == nil {
		return finishBindFailure(ctx, deps, claimed, apperr.CodeInternal)
	}
	if err := commitBindSuccess(ctx, deps, claimed, acct, identity, plaintext); err != nil {
		return finishBindFailure(ctx, deps, claimed, apperr.CodeInternal)
	}
	return nil
}

func commitBindSuccess(ctx context.Context, deps QRBindDeps, claimed *job.Job, acct *account.Account, identity bindIdentity, plaintext []byte) error {
	return deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
		// Finalize the generic Job while holding the row lock, before committing
		// account identity/session changes or their outbox messages. If the lease
		// reaper won the race, this conditional update fails and the transaction
		// rolls back all platform-side state derived from the stale worker.
		if err := deps.Jobs.Finish(tctx, claimed.ID, job.StatusSucceeded, nil, deps.Now()); err != nil {
			return err
		}
		if err := deps.Sessions.StoreInTx(tctx, acct.ID, acct.UserPublicID, acct.PublicID, plaintext); err != nil {
			return err
		}
		if err := deps.Accounts.SetIdentity(tctx, acct.ID, identity.PlatformUserID, identity.Nickname, identity.AvatarURL); err != nil {
			return err
		}
		if err := deps.Accounts.SetSessionStatus(tctx, acct.ID, account.SessionValid, deps.Now()); err != nil {
			return err
		}
		if err := deps.Accounts.SetBindingStatus(tctx, acct.ID, account.BindingBound); err != nil {
			return err
		}
		if err := enqueueInitialFriendsSync(tctx, deps, acct); err != nil {
			return err
		}
		return deps.Jobs.AppendEvent(tctx, claimed.ID, job.JobEvent{EventType: "success", Payload: json.RawMessage(`{"binding_status":"bound"}`), CreatedAt: deps.Now()})
	})
}

type qrValidationError struct{}

func (qrValidationError) Error() string { return "session validation returned an invalid result" }

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
	if err := deps.Outbox.Add(ctx, outbox.Message{
		Kind: outbox.KindFriendsSyncBrowser, AggregateType: "job",
		AggregateID: friendsJob.PublicID.String(),
		Payload:     mustJSON(map[string]string{"job_id": friendsJob.PublicID.String()}),
		DedupeKey:   "job.platform:" + friendsJob.PublicID.String(),
	}); err != nil {
		return err
	}
	return deps.Outbox.Add(ctx, outbox.Message{
		Kind: outbox.KindCapabilityProbe, AggregateType: "account",
		AggregateID: acct.PublicID.String(),
		Payload:     mustJSON(map[string]int64{"account_id": acct.ID}),
		// Scope the dedupe key to this binding lifecycle so a later rebind
		// gets a fresh health snapshot while duplicate enqueue paths remain safe.
		DedupeKey: "capability.probe:" + acct.PublicID.String() + ":" + friendsJob.PublicID.String(),
	})
}

func finishBindFailure(ctx context.Context, deps QRBindDeps, claimed *job.Job, code string) error {
	cleanup := releaseInitialBinding(deps, claimed)
	if deps.Tx == nil {
		failureErr := finishGenericJobFailure(ctx, deps.Jobs, claimed, code, deps.Now)
		if cleanup != nil {
			return errors.Join(failureErr, cleanup(ctx))
		}
		return failureErr
	}
	return commitWorkerFailure(ctx, deps.Tx, deps.Jobs, nil, claimed, 0, code, "", "", nil, deps.Now, cleanup)
}

func finishBindRiskFailure(ctx context.Context, deps QRBindDeps, claimed *job.Job, acctID int64, code string, events ...job.JobEvent) error {
	if deps.Tx == nil {
		return finishBindFailure(ctx, deps, claimed, code)
	}
	var fallback func(context.Context) error
	if !isRebindJob(claimed) {
		switch code {
		case apperr.CodeSessionExpired:
			fallback = func(tctx context.Context) error {
				return deps.Accounts.SetSessionStatus(tctx, acctID, account.SessionExpired, deps.Now())
			}
		case apperr.CodeChallengeRequired:
			fallback = func(tctx context.Context) error {
				return deps.Accounts.SetSessionStatus(tctx, acctID, account.SessionChallengeRequired, deps.Now())
			}
		}
	}
	// A re-login is an isolated replacement attempt. Do not pass the failure
	// through the normal risk projection because SESSION_EXPIRED and
	// CHALLENGE_REQUIRED would downgrade the still-valid old session.
	risk := deps.Risk
	if isRebindJob(claimed) {
		risk = nil
	}
	return commitWorkerFailureWithEvents(ctx, deps.Tx, deps.Jobs, risk, claimed, acctID, code,
		capability.AdapterBrowserConsumer, claimed.PublicID.String(), fallback, events, deps.Now,
		releaseInitialBinding(deps, claimed))
}

// releaseInitialBinding gives back the quota reservation created for a new
// binding when its terminal job fails. Re-login jobs reuse a bound account and
// must keep the existing binding/session untouched.
func releaseInitialBinding(deps QRBindDeps, claimed *job.Job) func(context.Context) error {
	if claimed == nil || isRebindJob(claimed) || claimed.AccountID == nil || deps.Accounts == nil {
		return nil
	}
	return func(ctx context.Context) error {
		acct, err := deps.Accounts.GetByID(ctx, *claimed.AccountID)
		if err != nil {
			if app, ok := apperr.As(err); ok && app.Code == apperr.CodeNotFound {
				return nil
			}
			return err
		}
		if acct != nil && acct.BindingStatus == account.BindingBinding {
			return deps.Accounts.SetBindingStatus(ctx, acct.ID, account.BindingUnbound)
		}
		return nil
	}
}

func isRebindJob(claimed *job.Job) bool {
	return claimed != nil && strings.HasPrefix(claimed.Type, "account.relogin.")
}

func rebindIdentityMatches(acct *account.Account, identity bindIdentity) bool {
	return acct == nil || acct.PlatformUserID == nil || *acct.PlatformUserID == identity.PlatformUserID
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
	case sidecar.ErrSMSCodeExpired:
		return apperr.CodeSMSExpired
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
