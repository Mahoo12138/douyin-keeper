package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/conversation"
)

type ConversationRepo struct {
	pool *pgxpool.Pool
}

func NewConversationRepo(pool *pgxpool.Pool) *ConversationRepo { return &ConversationRepo{pool: pool} }

// ReplaceGroupBatch applies a complete group snapshot and removes group rows
// that are no longer present. This is separate from SyncBatch because a
// regular conversation crawl may be filtered or eventually consistent.
func (r *ConversationRepo) ReplaceGroupBatch(ctx context.Context, accountID int64, items []conversation.SyncItem, at time.Time) error {
	platformIDs := make([]string, 0, len(items))
	for _, item := range items {
		platformIDs = append(platformIDs, item.PlatformConversationID)
	}
	if _, err := From(ctx, r.pool).Exec(ctx, `
		DELETE FROM conversations
		WHERE account_id=$1 AND conversation_type='group'
		  AND NOT (platform_conversation_id = ANY($2::text[]))`, accountID, platformIDs); err != nil {
		return err
	}
	return r.SyncBatch(ctx, accountID, items, at)
}

// SyncBatch upserts a complete page crawl without deleting conversations that
// are absent from the platform response. Platform lists can be filtered or
// eventually consistent; an explicit archive/delete signal is required before
// changing the local index state.
func (r *ConversationRepo) SyncBatch(ctx context.Context, accountID int64, items []conversation.SyncItem, at time.Time) error {
	for _, item := range items {
		if item.PlatformConversationID == "" {
			return fmt.Errorf("conversation sync: stable platform ids are required")
		}
		conversationType := item.ConversationType
		if conversationType == "" {
			conversationType = "unknown"
		}
		if conversationType != "direct" && conversationType != "group" && conversationType != "unknown" {
			return fmt.Errorf("conversation sync: unsupported conversation type %q", conversationType)
		}

		var friendID *int64
		if (conversationType != "group" && item.PlatformUserID != "") || conversationType == "group" {
			matchedID, err := r.upsertConversationFriend(ctx, accountID, item, conversationType, at)
			if err != nil {
				return err
			}
			friendID = &matchedID
		}
		var peerID any
		if item.PlatformUserID != "" {
			peerID = item.PlatformUserID
		}
		_, err := From(ctx, r.pool).Exec(ctx, `
			INSERT INTO conversations (public_id, account_id, friend_id, platform_conversation_id,
				conversation_type, peer_platform_user_id, peer_display_name,
				last_message_at, streak_activated_today, last_synced_at, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$10)
			ON CONFLICT (account_id, platform_conversation_id) DO UPDATE SET
				friend_id=EXCLUDED.friend_id,
				conversation_type=EXCLUDED.conversation_type,
				peer_platform_user_id=EXCLUDED.peer_platform_user_id,
				peer_display_name=CASE
					WHEN NULLIF(EXCLUDED.peer_display_name, '') IS NULL
						OR EXCLUDED.peer_display_name = '群聊'
					THEN conversations.peer_display_name
					ELSE EXCLUDED.peer_display_name
				END,
				last_message_at=COALESCE(EXCLUDED.last_message_at, conversations.last_message_at),
				streak_activated_today=EXCLUDED.streak_activated_today,
				last_synced_at=EXCLUDED.last_synced_at, updated_at=EXCLUDED.updated_at,
				archived_at=NULL`,
			uuid.New(), accountID, friendID, item.PlatformConversationID, conversationType,
			peerID, item.DisplayName, item.LastMessageAt, item.StreakActivatedToday, at)
		if err != nil {
			return err
		}
	}
	return nil
}

// SyncSnapshot applies a complete message-panel inventory. Rows not observed
// in this settled snapshot are archived so previous incomplete/invalid scans
// cannot remain visible in the active conversation list.
func (r *ConversationRepo) SyncSnapshot(ctx context.Context, accountID int64, items []conversation.SyncItem, at time.Time) error {
	if err := r.SyncBatch(ctx, accountID, items, at); err != nil {
		return err
	}
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE conversations
		SET archived_at=$2, updated_at=$2
		WHERE account_id=$1 AND (last_synced_at IS NULL OR last_synced_at < $2)`, accountID, at)
	return err
}

// upsertConversationFriend materializes the task/send projection for every
// conversation kind. Group rows use a stable internal routing key derived from
// their platform conversation ID; the actual platform conversation ID remains
// the send target and is never exposed as a user identity.
func (r *ConversationRepo) upsertConversationFriend(ctx context.Context, accountID int64, item conversation.SyncItem, conversationType string, at time.Time) (int64, error) {
	var friendID int64
	displayName := item.DisplayName
	if displayName == "" {
		displayName = "未命名会话"
	}
	platformUserID := item.PlatformUserID
	if conversationType == "group" {
		value := "__conversation__:" + item.PlatformConversationID
		platformUserID = value
	}
	err := From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO friends (public_id, account_id, platform_user_id, identity_status,
			display_name, nickname, avatar_url, streak_days, has_conversation, spark_enabled, last_seen_at, created_at, updated_at)
		VALUES ($1,$2,$3,'resolved',$4,$4,$5,COALESCE($6,0),true,COALESCE($6,0) > 0,$7,$7,$7)
		ON CONFLICT (account_id, platform_user_id)
		WHERE platform_user_id IS NOT NULL AND deleted_at IS NULL
		DO UPDATE SET
			identity_status='resolved',
			display_name=CASE WHEN EXCLUDED.display_name <> '' THEN EXCLUDED.display_name ELSE friends.display_name END,
			nickname=CASE WHEN EXCLUDED.nickname <> '' THEN EXCLUDED.nickname ELSE friends.nickname END,
			avatar_url=CASE WHEN NULLIF(EXCLUDED.avatar_url, '') IS NOT NULL THEN EXCLUDED.avatar_url ELSE friends.avatar_url END,
			streak_days=COALESCE($6, friends.streak_days),
			spark_enabled=CASE
				WHEN friends.spark_enabled_overridden THEN friends.spark_enabled
				WHEN $6 IS NULL THEN friends.spark_enabled
				ELSE $6 > 0
			END,
			has_conversation=true, last_seen_at=EXCLUDED.last_seen_at,
			updated_at=EXCLUDED.updated_at, deleted_at=NULL
		RETURNING id`, uuid.New(), accountID, platformUserID, displayName, item.AvatarURL, item.StreakDays, at).Scan(&friendID)
	if err != nil {
		return 0, err
	}
	return friendID, nil
}

func (r *ConversationRepo) ListByAccountOwned(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter conversation.ListFilter) ([]*conversation.Conversation, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT c.public_id, a.public_id, COALESCE(f.public_id, '00000000-0000-0000-0000-000000000000'::uuid),
			COALESCE(NULLIF(f.display_name, ''), c.peer_display_name),
			COALESCE(NULLIF(f.nickname, ''), c.peer_display_name), f.avatar_url,
			COALESCE(f.streak_days, 0), c.streak_activated_today, COALESCE(f.spark_enabled, false), f.last_sent_at,
			CASE WHEN f.id IS NOT NULL THEN f.identity_status ELSE CASE WHEN c.peer_platform_user_id <> '' THEN 'resolved' ELSE 'missing' END END,
			c.conversation_type, (c.conversation_type = 'group' OR f.id IS NOT NULL),
			c.last_message_at, c.last_synced_at, c.archived_at
		FROM conversations c
		JOIN douyin_accounts a ON a.id = c.account_id
		LEFT JOIN friends f ON f.id = c.friend_id AND f.account_id = c.account_id
		WHERE a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL AND (f.id IS NULL OR f.deleted_at IS NULL)
		  AND ($3 OR c.archived_at IS NULL)
		  AND ($4 OR c.conversation_type = 'group')
		ORDER BY c.archived_at IS NOT NULL, c.last_message_at DESC NULLS LAST, c.updated_at DESC, c.id DESC
		LIMIT $5`, accountPublicID, userID, filter.IncludeArchived, !filter.GroupOnly, filter.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*conversation.Conversation, 0)
	for rows.Next() {
		item := new(conversation.Conversation)
		var friendID uuid.UUID
		if err := rows.Scan(&item.ID, &item.AccountID, &friendID,
			&item.FriendDisplayName, &item.FriendNickname, &item.FriendAvatarURL,
			&item.StreakDays, &item.StreakActivatedToday, &item.SparkEnabled, &item.LastSentAt,
			&item.PlatformIdentityStatus, &item.ConversationType, &item.SparkSupported,
			&item.LastMessageAt, &item.LastSyncedAt, &item.ArchivedAt); err != nil {
			return nil, err
		}
		if friendID != uuid.Nil {
			item.FriendID = &friendID
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *ConversationRepo) ListByAccountOwnedPage(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter conversation.ListFilter) ([]*conversation.Conversation, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT c.id, c.public_id, a.public_id, COALESCE(f.public_id, '00000000-0000-0000-0000-000000000000'::uuid),
			COALESCE(NULLIF(f.display_name, ''), c.peer_display_name),
			COALESCE(NULLIF(f.nickname, ''), c.peer_display_name), f.avatar_url,
			COALESCE(f.streak_days, 0), c.streak_activated_today, COALESCE(f.spark_enabled, false), f.last_sent_at,
			CASE WHEN f.id IS NOT NULL THEN f.identity_status ELSE CASE WHEN c.peer_platform_user_id <> '' THEN 'resolved' ELSE 'missing' END END,
			c.conversation_type, (c.conversation_type = 'group' OR f.id IS NOT NULL),
			c.last_message_at, c.last_synced_at, c.archived_at
		FROM conversations c
		JOIN douyin_accounts a ON a.id = c.account_id
		LEFT JOIN friends f ON f.id = c.friend_id AND f.account_id = c.account_id
		WHERE a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL AND (f.id IS NULL OR f.deleted_at IS NULL)
		  AND ($3 OR c.archived_at IS NULL)
		  AND ($4::bigint = 0 OR c.id < $4)
		  AND ($5 OR c.conversation_type = 'group')
		ORDER BY c.id DESC
		LIMIT $6`, accountPublicID, userID, filter.IncludeArchived, filter.AfterID, !filter.GroupOnly, filter.Limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*conversation.Conversation, 0, filter.Limit+1)
	for rows.Next() {
		item := new(conversation.Conversation)
		var friendID uuid.UUID
		if err := rows.Scan(&item.InternalID, &item.ID, &item.AccountID, &friendID,
			&item.FriendDisplayName, &item.FriendNickname, &item.FriendAvatarURL,
			&item.StreakDays, &item.StreakActivatedToday, &item.SparkEnabled, &item.LastSentAt,
			&item.PlatformIdentityStatus, &item.ConversationType, &item.SparkSupported,
			&item.LastMessageAt, &item.LastSyncedAt, &item.ArchivedAt); err != nil {
			return nil, err
		}
		if friendID != uuid.Nil {
			item.FriendID = &friendID
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *ConversationRepo) SetArchived(ctx context.Context, userID int64, accountPublicID, conversationPublicID uuid.UUID, archived bool, at time.Time) (*conversation.Conversation, error) {
	var id int64
	err := From(ctx, r.pool).QueryRow(ctx, `
		UPDATE conversations c
		SET archived_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE NULL::timestamptz END, updated_at = $5::timestamptz
		FROM douyin_accounts a
		WHERE c.public_id = $3 AND c.account_id = a.id
		  AND a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL
		RETURNING c.id`, accountPublicID, userID, conversationPublicID, archived, at).Scan(&id)
	if err == pgx.ErrNoRows {
		return nil, apperr.NotFound(apperr.CodeNotFound, "conversation not found")
	}
	if err != nil {
		return nil, err
	}
	return r.getByOwnedID(ctx, userID, accountPublicID, conversationPublicID, id)
}

func (r *ConversationRepo) GetPlatformArchiveTargetOwned(ctx context.Context, userID int64, accountPublicID, conversationPublicID uuid.UUID) (*conversation.PlatformArchiveTarget, error) {
	var target conversation.PlatformArchiveTarget
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT c.id, c.public_id, a.id, a.public_id, a.user_id,
			COALESCE(NULLIF(f.platform_user_id, ''), NULLIF(c.peer_platform_user_id, '')), c.platform_conversation_id
		FROM conversations c
		JOIN douyin_accounts a ON a.id = c.account_id
		LEFT JOIN friends f ON f.id = c.friend_id AND f.account_id = c.account_id AND f.deleted_at IS NULL
		WHERE c.public_id = $3 AND a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL AND a.binding_status = 'bound'`,
		accountPublicID, userID, conversationPublicID).Scan(
		&target.ConversationID, &target.ConversationPublicID, &target.AccountID, &target.AccountPublicID,
		&target.UserID, &target.PlatformUserID, &target.PlatformConversationID)
	if err == pgx.ErrNoRows {
		return nil, apperr.NotFound(apperr.CodeConversationNotFound, "platform conversation not found")
	}
	if err != nil {
		return nil, err
	}
	return &target, nil
}

func (r *ConversationRepo) getByOwnedID(ctx context.Context, userID int64, accountPublicID, conversationPublicID uuid.UUID, id int64) (*conversation.Conversation, error) {
	var item conversation.Conversation
	var friendID uuid.UUID
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT c.public_id, a.public_id, COALESCE(f.public_id, '00000000-0000-0000-0000-000000000000'::uuid),
			COALESCE(NULLIF(f.display_name, ''), c.peer_display_name),
			COALESCE(NULLIF(f.nickname, ''), c.peer_display_name), f.avatar_url,
			COALESCE(f.streak_days, 0), c.streak_activated_today, COALESCE(f.spark_enabled, false), f.last_sent_at,
			CASE WHEN f.id IS NOT NULL THEN f.identity_status ELSE CASE WHEN c.peer_platform_user_id <> '' THEN 'resolved' ELSE 'missing' END END,
			c.conversation_type, (c.conversation_type = 'group' OR f.id IS NOT NULL),
			c.last_message_at, c.last_synced_at, c.archived_at
		FROM conversations c
		JOIN douyin_accounts a ON a.id = c.account_id
		LEFT JOIN friends f ON f.id = c.friend_id AND f.account_id = c.account_id AND f.deleted_at IS NULL
		WHERE c.id = $4 AND c.public_id = $3 AND a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL`,
		accountPublicID, userID, conversationPublicID, id).Scan(
		&item.ID, &item.AccountID, &friendID, &item.FriendDisplayName, &item.FriendNickname,
		&item.FriendAvatarURL, &item.StreakDays, &item.StreakActivatedToday, &item.SparkEnabled, &item.LastSentAt,
		&item.PlatformIdentityStatus, &item.ConversationType, &item.SparkSupported,
		&item.LastMessageAt, &item.LastSyncedAt, &item.ArchivedAt)
	if err == pgx.ErrNoRows {
		return nil, apperr.NotFound(apperr.CodeNotFound, "conversation not found")
	}
	if err != nil {
		return nil, err
	}
	if friendID != uuid.Nil {
		item.FriendID = &friendID
	}
	return &item, nil
}

var _ conversation.Repository = (*ConversationRepo)(nil)
var _ conversation.PageRepository = (*ConversationRepo)(nil)
var _ conversation.SyncRepository = (*ConversationRepo)(nil)
var _ conversation.PlatformArchiveRepository = (*ConversationRepo)(nil)
