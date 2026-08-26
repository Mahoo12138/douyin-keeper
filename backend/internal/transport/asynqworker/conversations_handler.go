package asynqworker

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
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

const maxConversationSyncPages = 1000

type conversationsListResult struct {
	Items      []conversationListItem `json:"items"`
	NextCursor *string                `json:"next_cursor"`
}

type conversationListItem struct {
	PlatformConversationID string  `json:"platform_conversation_id"`
	PlatformUserID         string  `json:"peer_platform_user_id"`
	DisplayName            string  `json:"peer_display_name"`
	Channel                string  `json:"channel"`
	LastMessageAt          *string `json:"last_message_at"`
}

func conversationsSyncHandler(loader PayloadLoader, deps SessionCheckDeps) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, t *asynq.Task) error {
		var envelope struct {
			OutboxID string `json:"outbox_id"`
		}
		if err := json.Unmarshal(t.Payload(), &envelope); err != nil || envelope.OutboxID == "" {
			return fmt.Errorf("conversations sync: invalid outbox payload")
		}
		message, err := loadPendingMessage(ctx, loader, envelope.OutboxID, "conversations sync: load outbox")
		if err != nil {
			return err
		}
		var ref struct {
			JobID string `json:"job_id"`
		}
		if err := json.Unmarshal(message.Payload, &ref); err != nil {
			return fmt.Errorf("conversations sync: invalid job payload: %w", err)
		}
		jobID, err := uuid.Parse(ref.JobID)
		if err != nil {
			return fmt.Errorf("conversations sync: invalid job id: %w", err)
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
			return fmt.Errorf("conversations sync: claim job returned nil")
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
		if claimed.AccountID == nil || claimed.UserID == nil || deps.Accounts == nil || deps.Sessions == nil || deps.Sidecar == nil || deps.Redis == nil || deps.Conversations == nil || deps.Tx == nil {
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
		profileDir, err := accountProfileDir(deps.ProfileRoot, acct.PublicID)
		if err != nil {
			return fail(apperr.CodeInternal)
		}

		var items []conversation.SyncItem
		seen := make(map[string]struct{})
		var cursor *string
		err = deps.Sessions.WithTempFile(ctx, acct.ID, acct.UserPublicID, acct.PublicID, func(path string) error {
			for page := 0; page < maxConversationSyncPages; page++ {
				if cancelled, err := cancelIfRequested(ctx, deps.Jobs, claimed, now); cancelled || err != nil {
					return err
				}
				var result conversationsListResult
				response, callErr := deps.Sidecar.Call(ctx, sidecar.Request{
					ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
					Op: sidecar.OpsConversationsList, DeadlineMS: 120_000,
					Input: map[string]any{
						"session": map[string]any{"kind": "playwright_storage_state_file", "path": path, "profile_dir": profileDir},
						"cursor":  cursor, "limit": 100,
					},
				})
				if callErr != nil {
					return callErr
				}
				if code := sidecarErrorCode(response); code != "" {
					return newSidecarCodeError(code)
				}
				if err := decodeResult(response, &result); err != nil {
					return conversationsResultError{}
				}
				pageItems, err := normalizeConversationItems(result.Items, seen)
				if err != nil {
					return conversationsResultError{}
				}
				items = append(items, pageItems...)
				if result.NextCursor == nil {
					return nil
				}
				next := strings.TrimSpace(*result.NextCursor)
				if next == "" || len(pageItems) == 0 || next != pageItems[len(pageItems)-1].PlatformConversationID || (cursor != nil && next == *cursor) {
					return conversationsResultError{}
				}
				cursor = &next
			}
			return conversationsResultError{}
		})
		if err != nil {
			code := apperr.CodeAdapterUnavailable
			if _, ok := err.(conversationsResultError); ok {
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
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "fetched", Payload: mustJSON(map[string]int{"count": len(items)}), CreatedAt: now()}); err != nil {
			return err
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "syncing", Payload: json.RawMessage(`{}`), CreatedAt: now()}); err != nil {
			return err
		}
		if err := commitConversationSyncSuccess(ctx, deps.Tx, deps.Jobs, deps.Conversations, claimed, acct.ID, items, now); err != nil {
			return fail(apperr.CodeInternal)
		}
		return nil
	}
}

func normalizeConversationItems(items []conversationListItem, seen map[string]struct{}) ([]conversation.SyncItem, error) {
	out := make([]conversation.SyncItem, 0, len(items))
	for _, item := range items {
		conversationID := strings.TrimSpace(item.PlatformConversationID)
		platformUserID := strings.TrimSpace(item.PlatformUserID)
		if conversationID == "" || len(conversationID) > 512 || platformUserID == "" || len(platformUserID) > 256 {
			return nil, fmt.Errorf("conversation sync: stable platform ids are required")
		}
		if _, exists := seen[conversationID]; exists {
			return nil, fmt.Errorf("conversation sync: duplicate conversation id")
		}
		channel := strings.TrimSpace(item.Channel)
		if channel != "consumer" && channel != "creator" {
			return nil, fmt.Errorf("conversation sync: unsupported channel %q", channel)
		}
		var lastMessageAt *time.Time
		if item.LastMessageAt != nil && strings.TrimSpace(*item.LastMessageAt) != "" {
			parsed, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(*item.LastMessageAt))
			if err != nil {
				return nil, fmt.Errorf("conversation sync: invalid last message time")
			}
			lastMessageAt = &parsed
		}
		seen[conversationID] = struct{}{}
		displayName := []rune(strings.TrimSpace(item.DisplayName))
		if len(displayName) > 128 {
			displayName = displayName[:128]
		}
		out = append(out, conversation.SyncItem{
			PlatformConversationID: conversationID,
			PlatformUserID:         platformUserID,
			DisplayName:            string(displayName),
			Channel:                channel,
			LastMessageAt:          lastMessageAt,
		})
	}
	return out, nil
}

func commitConversationSyncSuccess(ctx context.Context, tx job.TxManager, jobs job.Repository, conversations conversation.SyncRepository, claimed *job.Job, accountID int64, items []conversation.SyncItem, now func() time.Time) error {
	return tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := jobs.Finish(tctx, claimed.ID, job.StatusSucceeded, nil, now()); err != nil {
			return err
		}
		if err := conversations.SyncBatch(tctx, accountID, items, now()); err != nil {
			return err
		}
		return jobs.AppendEvent(tctx, claimed.ID, job.JobEvent{EventType: "success", Payload: mustJSON(map[string]int{"count": len(items)}), CreatedAt: now()})
	})
}

type conversationsResultError struct{}

func (conversationsResultError) Error() string {
	return "conversations.list returned an invalid result"
}
