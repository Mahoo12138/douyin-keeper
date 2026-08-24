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
		message, err := loader.FetchByPublicID(ctx, envelope.OutboxID)
		if err != nil {
			return fmt.Errorf("friends sync: load outbox: %w", err)
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
		if err != nil || claimed == nil {
			return err
		}
		stopHeartbeat := startLeaseHeartbeat(ctx, deps.LockTTL, func(heartbeatCtx context.Context) error {
			return deps.Jobs.Heartbeat(heartbeatCtx, claimed.ID, deps.WorkerID, deps.LockTTL)
		})
		defer stopHeartbeat()
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, now); cancelled || err != nil {
			return err
		}
		fail := func(code string) error {
			_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "error", Payload: mustJSON(map[string]string{"code": code}), CreatedAt: now()})
			return deps.Jobs.Finish(ctx, claimed.ID, job.StatusFailed, &code, now())
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "started", Payload: json.RawMessage(`{}`), CreatedAt: now()}); err != nil {
			return err
		}
		if claimed.AccountID == nil || claimed.UserID == nil || deps.Accounts == nil || deps.Sessions == nil || deps.Sidecar == nil || deps.Redis == nil || deps.Friends == nil || deps.Tx == nil {
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
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, now); cancelled || err != nil {
			return err
		}

		var result friendsListResult
		err = deps.Sessions.WithTempFile(ctx, acct.ID, acct.UserPublicID, acct.PublicID, func(path string) error {
			response, callErr := deps.Sidecar.Call(ctx, sidecar.Request{
				ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
				Op: sidecar.OpsFriendsList, DeadlineMS: 120_000,
				Input: map[string]any{"session": map[string]any{"kind": "playwright_storage_state_file", "path": path}},
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
			if deps.Risk != nil {
				observeWorkerRisk(ctx, deps.Risk, acct.ID, code, capability.AdapterBrowserConsumer, claimed.PublicID.String())
			} else if code == apperr.CodeSessionExpired {
				_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionExpired, now())
			} else if code == apperr.CodeChallengeRequired {
				_ = deps.Accounts.SetSessionStatus(ctx, acct.ID, account.SessionChallengeRequired, now())
			} else if code == apperr.CodePlatformRateLimited {
				cooldown := now().Add(10 * time.Minute)
				_ = deps.Accounts.SetRiskStatus(ctx, acct.ID, account.RiskCoolingDown, &cooldown)
			}
			return fail(code)
		}
		if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, now); cancelled || err != nil {
			return err
		}
		if !result.Complete {
			observeWorkerRisk(ctx, deps.Risk, acct.ID, apperr.CodeAdapterIncompatible, capability.AdapterBrowserConsumer, claimed.PublicID.String())
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, now)
			return fail(apperr.CodeAdapterIncompatible)
		}
		items, seenIDs, seenConversationIDs, err := normalizeFriendItems(result.Friends)
		if err != nil {
			observeWorkerRisk(ctx, deps.Risk, acct.ID, apperr.CodeAdapterIncompatible, capability.AdapterBrowserConsumer, claimed.PublicID.String())
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, now)
			return fail(apperr.CodeAdapterIncompatible)
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{
			EventType: "fetched", Payload: mustJSON(map[string]int{"count": len(items)}), CreatedAt: now(),
		}); err != nil {
			return err
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "syncing", Payload: json.RawMessage(`{}`), CreatedAt: now()}); err != nil {
			return err
		}
		if err := deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
			if err := deps.Friends.SyncBatch(tctx, acct.ID, items, seenIDs, seenConversationIDs, now()); err != nil {
				return err
			}
			return deps.Accounts.SetLastFriendSyncAt(tctx, acct.ID, now())
		}); err != nil {
			return fail(apperr.CodeInternal)
		}
		_ = deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "success", Payload: mustJSON(map[string]int{"count": len(items)}), CreatedAt: now()})
		return deps.Jobs.Finish(ctx, claimed.ID, job.StatusSucceeded, nil, now())
	}
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
