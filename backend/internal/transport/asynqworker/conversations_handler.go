package asynqworker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgconn"

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
	PlatformComponentKey   string  `json:"platform_component_key"`
	PlatformConversationID string  `json:"platform_conversation_id"`
	PlatformUserID         string  `json:"peer_platform_user_id"`
	DisplayName            string  `json:"peer_display_name"`
	AvatarURL              string  `json:"peer_avatar_url"`
	ConversationType       string  `json:"conversation_type"`
	LastMessageAt          *string `json:"last_message_at"`
	StreakDays             *int    `json:"streak_days"`
	StreakActivatedToday   *bool   `json:"streak_activated_today"`
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
		// The message panel is the single source of truth. It returns the mixed
		// conversation inventory; direct/group is only metadata used by routing
		// and presentation, never a separate crawl path.
		groupOnly := false
		selfPlatformUserID := ""
		if acct.PlatformUserID != nil {
			selfPlatformUserID = strings.TrimSpace(*acct.PlatformUserID)
		}
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
						"cursor":  cursor, "limit": 100, "group_only": groupOnly,
						"self_platform_user_id": selfPlatformUserID,
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
				pageItems, err := normalizeConversationItems(filterConversationListItems(result.Items, groupOnly), seen)
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
			slog.Error("conversation sync execution failed",
				"job_public_id", claimed.PublicID,
				"account_public_id", acct.PublicID,
				"error_code", code,
				"err", err,
			)
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, code, now)
			return finishFriendsFailure(ctx, deps, claimed, acct.ID, code, now)
		}
		// An empty conversation snapshot is not a successful sync. It usually
		// means the message panel rendered but its virtualized rows or identity
		// fields were not actually read. Keep the previous snapshot intact and
		// surface an adapter failure for diagnosis/retry.
		if len(items) == 0 {
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, now)
			return finishFriendsFailure(ctx, deps, claimed, acct.ID, apperr.CodeAdapterIncompatible, now)
		}
		selfPeerCount := countSelfConversationPeers(items, acct.PlatformUserID)
		if selfPeerCount > 0 {
			// A direct conversation can never target the currently authenticated
			// account. Reject the whole snapshot so a parser regression cannot
			// replace valid peers with the account owner's identity.
			slog.Warn("conversation sync rejected self peers", "item_count", len(items), "self_peer_count", selfPeerCount)
			observeWorkerHealthFailure(ctx, deps.Health, capability.AdapterBrowserConsumer, apperr.CodeAdapterIncompatible, now)
			return finishFriendsFailure(ctx, deps, claimed, acct.ID, apperr.CodeAdapterIncompatible, now)
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "fetched", Payload: mustJSON(map[string]int{"count": len(items)}), CreatedAt: now()}); err != nil {
			return err
		}
		if err := deps.Jobs.AppendEvent(ctx, claimed.ID, job.JobEvent{EventType: "syncing", Payload: json.RawMessage(`{}`), CreatedAt: now()}); err != nil {
			return err
		}
		if err := commitConversationSyncSuccess(ctx, deps.Tx, deps.Jobs, deps.Conversations, deps.Accounts, claimed, acct.ID, items, groupOnly, now); err != nil {
			logConversationSyncCommitFailure(err, len(items))
			return fail(apperr.CodeInternal)
		}
		return nil
	}
}

func countSelfConversationPeers(items []conversation.SyncItem, selfPlatformUserID *string) int {
	if selfPlatformUserID == nil || strings.TrimSpace(*selfPlatformUserID) == "" {
		return 0
	}
	selfID := strings.TrimSpace(*selfPlatformUserID)
	count := 0
	for _, item := range items {
		if item.ConversationType == "direct" && strings.TrimSpace(item.PlatformUserID) == selfID {
			count++
		}
	}
	return count
}

func filterConversationListItems(items []conversationListItem, groupOnly bool) []conversationListItem {
	if !groupOnly {
		return items
	}
	filtered := make([]conversationListItem, 0, len(items))
	for _, item := range items {
		if strings.TrimSpace(item.ConversationType) == "group" {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func normalizeConversationItems(items []conversationListItem, seen map[string]struct{}) ([]conversation.SyncItem, error) {
	out := make([]conversation.SyncItem, 0, len(items))
	for _, item := range items {
		componentKey := strings.TrimSpace(item.PlatformComponentKey)
		conversationID := strings.TrimSpace(item.PlatformConversationID)
		platformUserID := strings.TrimSpace(item.PlatformUserID)
		if componentKey == "" || len(componentKey) > 512 || conversationID == "" || len(conversationID) > 512 || len(platformUserID) > 256 {
			return nil, fmt.Errorf("conversation sync: stable platform ids are required")
		}
		if componentKey != conversationID {
			return nil, fmt.Errorf("conversation sync: component key does not match response conversation id")
		}
		componentSeenKey := "component-key:" + componentKey
		if _, exists := seen[componentSeenKey]; exists {
			return nil, fmt.Errorf("conversation sync: duplicate component key")
		}
		if _, exists := seen[conversationID]; exists {
			return nil, fmt.Errorf("conversation sync: duplicate conversation id")
		}
		conversationType := strings.TrimSpace(item.ConversationType)
		if conversationType == "" {
			conversationType = "unknown"
		}
		if conversationType != "direct" && conversationType != "group" && conversationType != "unknown" {
			return nil, fmt.Errorf("conversation sync: unsupported conversation type %q", conversationType)
		}
		if conversationType == "direct" && platformUserID == "" {
			return nil, fmt.Errorf("conversation sync: direct conversations require a peer id")
		}
		if conversationType == "direct" {
			peerKey := "direct-peer:" + platformUserID
			if _, exists := seen[peerKey]; exists {
				return nil, fmt.Errorf("conversation sync: duplicate direct peer identity")
			}
			seen[peerKey] = struct{}{}
		}
		if item.StreakDays != nil && (*item.StreakDays < 0 || *item.StreakDays > 10000) {
			return nil, fmt.Errorf("conversation sync: invalid streak days")
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
		seen[componentSeenKey] = struct{}{}
		displayName := []rune(strings.TrimSpace(item.DisplayName))
		if len(displayName) > 128 {
			displayName = displayName[:128]
		}
		out = append(out, conversation.SyncItem{
			PlatformComponentKey:   componentKey,
			PlatformConversationID: conversationID,
			PlatformUserID:         platformUserID,
			DisplayName:            string(displayName),
			AvatarURL:              normalizeAvatarURL(item.AvatarURL),
			ConversationType:       conversationType,
			LastMessageAt:          lastMessageAt,
			StreakDays:             item.StreakDays,
			StreakActivatedToday:   item.StreakActivatedToday,
		})
	}
	return out, nil
}

func normalizeAvatarURL(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 2048 || (!strings.HasPrefix(value, "https://") && !strings.HasPrefix(value, "http://")) {
		return ""
	}
	return value
}

type conversationSyncAccountWriter interface {
	SetLastFriendSyncAt(context.Context, int64, time.Time) error
}

func commitConversationSyncSuccess(ctx context.Context, tx job.TxManager, jobs job.Repository, conversations conversation.SyncRepository, accounts conversationSyncAccountWriter, claimed *job.Job, accountID int64, items []conversation.SyncItem, groupOnly bool, now func() time.Time) error {
	return tx.WithinTx(ctx, func(tctx context.Context) error {
		syncAt := now()
		if err := jobs.Finish(tctx, claimed.ID, job.StatusSucceeded, nil, syncAt); err != nil {
			return err
		}
		var syncErr error
		if groupRepo, ok := conversations.(conversation.GroupSyncRepository); groupOnly && ok {
			syncErr = groupRepo.ReplaceGroupBatch(tctx, accountID, items, syncAt)
		} else if snapshotRepo, ok := conversations.(conversation.SnapshotSyncRepository); ok {
			syncErr = snapshotRepo.SyncSnapshot(tctx, accountID, items, syncAt)
		} else {
			syncErr = conversations.SyncBatch(tctx, accountID, items, syncAt)
		}
		if err := syncErr; err != nil {
			return err
		}
		if err := accounts.SetLastFriendSyncAt(tctx, accountID, syncAt); err != nil {
			return err
		}
		return jobs.AppendEvent(tctx, claimed.ID, job.JobEvent{EventType: "success", Payload: mustJSON(map[string]int{"count": len(items)}), CreatedAt: syncAt})
	})
}

func logConversationSyncCommitFailure(err error, itemCount int) {
	// Keep the worker log useful without emitting platform IDs, peer IDs, or
	// database error details that may contain user data.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		slog.Error("conversation sync commit failed", "item_count", itemCount, "error_type", fmt.Sprintf("%T", err), "sqlstate", pgErr.Code, "constraint", pgErr.ConstraintName)
		return
	}
	slog.Error("conversation sync commit failed", "item_count", itemCount, "error_type", fmt.Sprintf("%T", err))
}

type conversationsResultError struct{}

func (conversationsResultError) Error() string {
	return "conversations.list returned an invalid result"
}
