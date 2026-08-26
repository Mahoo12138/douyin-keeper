package asynqworker

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/redislock"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

type friendsListResult struct {
	Friends  []friendsListItem `json:"friends"`
	Complete bool              `json:"complete"`
}

type friendsListItem struct {
	PlatformUserID  *string `json:"platform_user_id"`
	IdentityStatus  string  `json:"identity_status"`
	DisplayName     string  `json:"display_name"`
	Nickname        string  `json:"nickname"`
	ShortID         *string `json:"short_id"`
	AvatarURL       *string `json:"avatar_url"`
	StreakDays      int     `json:"streak_days"`
	HasConversation bool    `json:"has_conversation"`
	Conversation    *struct {
		PlatformConversationID string `json:"platform_conversation_id"`
		Channel                string `json:"channel"`
	} `json:"conversation"`
}

func friendsSyncHandler(loader PayloadLoader, deps SessionCheckDeps) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, t *asynq.Task) error {
		var envelope struct {
			OutboxID string `json:"outbox_id"`
		}
		if err := json.Unmarshal(t.Payload(), &envelope); err != nil || envelope.OutboxID == "" {
			return fmt.Errorf("friends sync: invalid outbox payload")
		}
		message, err := loadPendingMessage(ctx, loader, envelope.OutboxID, "friends sync: load outbox")
		if err != nil {
			return err
		}
		var ref struct {
			JobID string `json:"job_id"`
		}
		if err := json.Unmarshal(message.Payload, &ref); err != nil {
			return fmt.Errorf("friends sync: invalid job payload: %w", err)
		}
		jobID, err := uuid.Parse(ref.JobID)
		if err != nil {
			return fmt.Errorf("friends sync: invalid job id: %w", err)
		}
		now := deps.Now
		if now == nil {
			now = time.Now
		}
		if deps.LockTTL <= 0 {
			deps.LockTTL = 5 * time.Minute
		}
		claimed, err := deps.Jobs.Claim(ctx, jobID, deps.WorkerID, deps.LockTTL)
		if err != nil {
			return err
		}
		if claimed == nil {
			return fmt.Errorf("friends sync: claim job returned nil")
		}
		stopHeartbeat := startLeaseHeartbeat(ctx, deps.LockTTL, func(heartbeatCtx context.Context) error {
			return deps.Jobs.Heartbeat(heartbeatCtx, claimed.ID, deps.WorkerID, deps.LockTTL)
		})
		defer stopHeartbeat()
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, now); cancelled || err != nil {
			return err
		}
		fail := func(code string) error {
			return finishGenericJobFailure(ctx, deps.Jobs, claimed, code, now)
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "started", Payload: json.RawMessage(`{}`), CreatedAt: now()}); err != nil {
			return err
		}
		if claimed.AccountID == nil || claimed.UserID == nil || deps.Accounts == nil || deps.Sessions == nil || deps.Sidecar == nil || deps.Redis == nil || deps.Friends == nil || deps.Tx == nil {
			return fail(apperr.CodeInternal)
		}
		if err := requireAdapterAccess(ctx, deps.Health, capability.AdapterBrowserConsumer); err != nil {
			return finishFriendsFailure(ctx, deps, claimed, *claimed.AccountID, adapterGateCode(err), now)
		}
		acct, err := deps.Accounts.GetByID(ctx, *claimed.AccountID)
		if err != nil || !accountMatchesUser(acct, *claimed.UserID) {
			return fail(apperr.CodeNotFound)
		}
		lock, err := redislock.Acquire(ctx, deps.Redis, "lock:account:"+fmt.Sprint(acct.ID), claimed.PublicID.String(), deps.LockTTL)
		if err != nil {
			return fail(apperr.CodeAccountBusy)
		}
		defer releaseWorkerLock(ctx, lock, "account")
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, now); cancelled || err != nil {
			return err
		}
		profileDir, err := accountProfileDir(deps.ProfileRoot, acct.PublicID)
		if err != nil {
			return finishFriendsFailure(ctx, deps, claimed, acct.ID, apperr.CodeInternal, now)
		}

		var result friendsListResult
		err = deps.Sessions.WithTempFile(ctx, acct.ID, acct.UserPublicID, acct.PublicID, func(path string) error {
			response, callErr := deps.Sidecar.Call(ctx, sidecar.Request{
				ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
				Op: sidecar.OpsFriendsList, DeadlineMS: 120_000,
				Input: sessionInput(path, profileDir),
			})
			if callErr != nil {
				return callErr
			}
			if code := sidecarErrorCode(response); code != "" {
				return newSidecarCodeError(code)
			}
			if err := decodeResult(response, &result); err != nil {
				return friendsResultError{}
			}
			return nil
		})
		if err != nil {
			code := apperr.CodeAdapterUnavailable
			if _, ok := err.(friendsResultError); ok {
				code = apperr.CodeAdapterIncompatible
			}
			if responseCode, ok := sidecarResponseCode(err); ok {
				code = mapFriendsSidecarError(responseCode)
			}
			if app, ok := apperr.As(err); ok {
				code = app.Code
			}
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, code, now)
			return finishFriendsFailure(ctx, deps, claimed, acct.ID, code, now)
		}
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, now); cancelled || err != nil {
			return err
		}
		if !result.Complete {
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, now)
			return finishFriendsFailure(ctx, deps, claimed, acct.ID, apperr.CodeAdapterIncompatible, now)
		}
		items, seenIDs, seenConversationIDs, err := normalizeFriendItems(result.Friends)
		if err != nil {
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, now)
			return finishFriendsFailure(ctx, deps, claimed, acct.ID, apperr.CodeAdapterIncompatible, now)
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{
			EventType: "fetched", Payload: mustJSON(map[string]int{"count": len(items)}), CreatedAt: now(),
		}); err != nil {
			return err
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "syncing", Payload: json.RawMessage(`{}`), CreatedAt: now()}); err != nil {
			return err
		}
		if err := commitFriendsSyncSuccess(ctx, deps.Tx, deps.Jobs, deps.Friends, deps.Accounts,
			claimed, acct.ID, items, seenIDs, seenConversationIDs, now); err != nil {
			return fail(apperr.CodeInternal)
		}
		return nil
	}
}

func finishFriendsFailure(ctx context.Context, deps SessionCheckDeps, claimed *job.Job, accountID int64, code string, now func() time.Time) error {
	var fallback func(context.Context) error
	switch code {
	case apperr.CodeSessionExpired:
		fallback = func(tctx context.Context) error {
			return deps.Accounts.SetSessionStatus(tctx, accountID, account.SessionExpired, now())
		}
	case apperr.CodeChallengeRequired:
		fallback = func(tctx context.Context) error {
			return deps.Accounts.SetSessionStatus(tctx, accountID, account.SessionChallengeRequired, now())
		}
	case apperr.CodePlatformRateLimited:
		fallback = func(tctx context.Context) error {
			cooldown := now().Add(10 * time.Minute)
			return deps.Accounts.SetRiskStatus(tctx, accountID, account.RiskCoolingDown, &cooldown)
		}
	}
	return commitWorkerFailure(ctx, deps.Tx, deps.Jobs, deps.Risk, claimed, accountID, code,
		capability.AdapterBrowserConsumer, claimed.PublicID.String(), fallback, now)
}

type friendSyncAccountWriter interface {
	SetLastFriendSyncAt(context.Context, int64, time.Time) error
}

// commitFriendsSyncSuccess makes the Job terminal transition the first
// guarded write in the transaction. If the lease reaper won the race, the
// conditional Finish fails and the friend snapshot is rolled back with it.
func commitFriendsSyncSuccess(
	ctx context.Context,
	tx job.TxManager,
	j job.Repository,
	friends friend.SyncRepository,
	accounts friendSyncAccountWriter,
	claimed *job.Job,
	accountID int64,
	items []friend.SyncItem,
	seenPlatformIDs, seenConversationIDs []string,
	now func() time.Time,
) error {
	return tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := j.Finish(tctx, claimed.ID, job.StatusSucceeded, nil, now()); err != nil {
			return err
		}
		if err := friends.SyncBatch(tctx, accountID, items, seenPlatformIDs, seenConversationIDs, now()); err != nil {
			return err
		}
		if err := accounts.SetLastFriendSyncAt(tctx, accountID, now()); err != nil {
			return err
		}
		return j.AppendEvent(tctx, claimed.ID, job.JobEvent{
			EventType: "success", Payload: mustJSON(map[string]int{"count": len(items)}), CreatedAt: now(),
		})
	})
}

func normalizeFriendItems(items []friendsListItem) ([]friend.SyncItem, []string, []string, error) {
	out := make([]friend.SyncItem, 0, len(items))
	seen := make([]string, 0, len(items))
	seenConversations := make([]string, 0, len(items))
	seenSet := map[string]struct{}{}
	for _, item := range items {
		var platformID *string
		if item.PlatformUserID != nil {
			value := strings.TrimSpace(*item.PlatformUserID)
			if value != "" {
				if _, exists := seenSet[value]; exists {
					return nil, nil, nil, fmt.Errorf("duplicate platform user id")
				}
				seenSet[value] = struct{}{}
				seen = append(seen, value)
				platformID = &value
			}
		}
		status := friend.IdentityStatus(strings.TrimSpace(item.IdentityStatus))
		if status == "" {
			status = friend.IdentityPending
		}
		if status != friend.IdentityPending && status != friend.IdentityResolved && status != friend.IdentityAmbiguous && status != friend.IdentityMissing {
			return nil, nil, nil, fmt.Errorf("unknown identity status %q", status)
		}
		if item.StreakDays < 0 {
			return nil, nil, nil, fmt.Errorf("negative streak days")
		}
		var conversation *friend.ConversationSnapshot
		if item.Conversation != nil {
			if strings.TrimSpace(item.Conversation.PlatformConversationID) == "" {
				return nil, nil, nil, fmt.Errorf("conversation id is empty")
			}
			conversation = &friend.ConversationSnapshot{
				PlatformConversationID: strings.TrimSpace(item.Conversation.PlatformConversationID),
				Channel:                strings.TrimSpace(item.Conversation.Channel),
			}
			seenConversations = append(seenConversations, conversation.PlatformConversationID)
		}
		out = append(out, friend.SyncItem{
			PlatformUserID: platformID, IdentityStatus: status,
			DisplayName: item.DisplayName, Nickname: item.Nickname, ShortID: item.ShortID,
			AvatarURL: item.AvatarURL, StreakDays: item.StreakDays,
			HasConversation: item.HasConversation, Conversation: conversation,
		})
	}
	return out, seen, seenConversations, nil
}

type sidecarCodeError struct{ code string }

type friendsResultError struct{}

func (friendsResultError) Error() string { return "friends.list returned an invalid result" }

func (e sidecarCodeError) Error() string { return e.code }

func newSidecarCodeError(code string) error { return sidecarCodeError{code: code} }

func sidecarResponseCode(err error) (string, bool) {
	value, ok := err.(sidecarCodeError)
	return value.code, ok
}

func mapFriendsSidecarError(code string) string {
	switch code {
	case sidecar.ErrSessionExpired:
		return apperr.CodeSessionExpired
	case sidecar.ErrChallengeRequired:
		return apperr.CodeChallengeRequired
	case sidecar.ErrPlatformRateLimited:
		return apperr.CodePlatformRateLimited
	case sidecar.ErrBrowserSelectorChanged:
		return apperr.CodeBrowserSelectorChanged
	case sidecar.ErrAdapterIncompatible:
		return apperr.CodeAdapterIncompatible
	case sidecar.ErrNetworkTimeout:
		return apperr.CodeNetworkTimeout
	default:
		return apperr.CodeAdapterUnavailable
	}
}
