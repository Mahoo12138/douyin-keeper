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

// SyncBatch upserts a complete page crawl without deleting conversations that
// are absent from the platform response. Platform lists can be filtered or
// eventually consistent; an explicit archive/delete signal is required before
// changing the local index state.
func (r *ConversationRepo) SyncBatch(ctx context.Context, accountID int64, items []conversation.SyncItem, at time.Time) error {
	for _, item := range items {
		if item.PlatformConversationID == "" || item.PlatformUserID == "" {
			return fmt.Errorf("conversation sync: stable platform ids are required")
		}
		if item.Channel != "consumer" && item.Channel != "creator" {
			return fmt.Errorf("conversation sync: unsupported channel %q", item.Channel)
		}
		friendID, found, err := r.findConversationFriend(ctx, accountID, item, at)
		if err != nil {
			return err
		}
		// A conversation is not proof that the other party is a friend. The
		// friends.list adapter is the source of friend membership; keeping this
		// guard here prevents a chat-only account from being promoted into a
		// sendable friend when the two crawls are out of order or incomplete.
		if !found {
			continue
		}
		_, err = From(ctx, r.pool).Exec(ctx, `
			INSERT INTO conversations (public_id, account_id, friend_id, platform_conversation_id,
				channel, last_message_at, last_synced_at, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)
			ON CONFLICT (account_id, platform_conversation_id) DO UPDATE SET
				friend_id=EXCLUDED.friend_id, channel=EXCLUDED.channel,
				last_message_at=COALESCE(EXCLUDED.last_message_at, conversations.last_message_at),
				last_synced_at=EXCLUDED.last_synced_at, updated_at=EXCLUDED.updated_at`,
			uuid.New(), accountID, friendID, item.PlatformConversationID, item.Channel,
			item.LastMessageAt, at)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *ConversationRepo) findConversationFriend(ctx context.Context, accountID int64, item conversation.SyncItem, at time.Time) (int64, bool, error) {
	var friendID int64
	err := From(ctx, r.pool).QueryRow(ctx, `
		UPDATE friends SET
			has_conversation=true,
			display_name=CASE WHEN $3 <> '' THEN $3 ELSE display_name END,
			last_seen_at=$4, updated_at=$4
		WHERE account_id=$1 AND platform_user_id=$2 AND deleted_at IS NULL
		RETURNING id`, accountID, item.PlatformUserID, item.DisplayName, at).Scan(&friendID)
	if err == nil {
		return friendID, true, nil
	}
	if err != pgx.ErrNoRows {
		return 0, false, err
	}
	return 0, false, nil
}

func (r *ConversationRepo) ListByAccountOwned(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter conversation.ListFilter) ([]*conversation.Conversation, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT c.public_id, a.public_id, f.public_id,
			f.display_name, f.nickname, f.avatar_url, f.identity_status,
			c.channel, c.last_message_at, c.last_synced_at, c.archived_at
		FROM conversations c
		JOIN douyin_accounts a ON a.id = c.account_id
		JOIN friends f ON f.id = c.friend_id AND f.account_id = c.account_id
		WHERE a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL AND f.deleted_at IS NULL
		  AND ($3 OR c.archived_at IS NULL)
		ORDER BY c.archived_at IS NOT NULL, c.last_message_at DESC NULLS LAST, c.updated_at DESC, c.id DESC
		LIMIT $4`, accountPublicID, userID, filter.IncludeArchived, filter.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*conversation.Conversation, 0)
	for rows.Next() {
		item := new(conversation.Conversation)
		if err := rows.Scan(&item.ID, &item.AccountID, &item.FriendID,
			&item.FriendDisplayName, &item.FriendNickname, &item.FriendAvatarURL,
			&item.PlatformIdentityStatus, &item.Channel, &item.LastMessageAt, &item.LastSyncedAt, &item.ArchivedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *ConversationRepo) ListByAccountOwnedPage(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter conversation.ListFilter) ([]*conversation.Conversation, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT c.id, c.public_id, a.public_id, f.public_id,
			f.display_name, f.nickname, f.avatar_url, f.identity_status,
			c.channel, c.last_message_at, c.last_synced_at, c.archived_at
		FROM conversations c
		JOIN douyin_accounts a ON a.id = c.account_id
		JOIN friends f ON f.id = c.friend_id AND f.account_id = c.account_id
		WHERE a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL AND f.deleted_at IS NULL
		  AND ($3 OR c.archived_at IS NULL)
		  AND ($4::bigint = 0 OR c.id < $4)
		ORDER BY c.id DESC
		LIMIT $5`, accountPublicID, userID, filter.IncludeArchived, filter.AfterID, filter.Limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*conversation.Conversation, 0, filter.Limit+1)
	for rows.Next() {
		item := new(conversation.Conversation)
		if err := rows.Scan(&item.InternalID, &item.ID, &item.AccountID, &item.FriendID,
			&item.FriendDisplayName, &item.FriendNickname, &item.FriendAvatarURL,
			&item.PlatformIdentityStatus, &item.Channel, &item.LastMessageAt, &item.LastSyncedAt, &item.ArchivedAt); err != nil {
			return nil, err
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
		  AND EXISTS (SELECT 1 FROM friends f WHERE f.id = c.friend_id AND f.deleted_at IS NULL)
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
			f.platform_user_id, c.platform_conversation_id
		FROM conversations c
		JOIN douyin_accounts a ON a.id = c.account_id
		JOIN friends f ON f.id = c.friend_id AND f.account_id = c.account_id
		WHERE c.public_id = $3 AND a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL AND a.binding_status = 'bound' AND f.deleted_at IS NULL`,
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
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT c.public_id, a.public_id, f.public_id,
			f.display_name, f.nickname, f.avatar_url, f.identity_status,
			c.channel, c.last_message_at, c.last_synced_at, c.archived_at
		FROM conversations c
		JOIN douyin_accounts a ON a.id = c.account_id
		JOIN friends f ON f.id = c.friend_id AND f.account_id = c.account_id
		WHERE c.id = $4 AND c.public_id = $3 AND a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL AND f.deleted_at IS NULL`,
		accountPublicID, userID, conversationPublicID, id).Scan(
		&item.ID, &item.AccountID, &item.FriendID, &item.FriendDisplayName, &item.FriendNickname,
		&item.FriendAvatarURL, &item.PlatformIdentityStatus, &item.Channel, &item.LastMessageAt,
		&item.LastSyncedAt, &item.ArchivedAt)
	if err == pgx.ErrNoRows {
		return nil, apperr.NotFound(apperr.CodeNotFound, "conversation not found")
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

var _ conversation.Repository = (*ConversationRepo)(nil)
var _ conversation.PageRepository = (*ConversationRepo)(nil)
var _ conversation.SyncRepository = (*ConversationRepo)(nil)
var _ conversation.PlatformArchiveRepository = (*ConversationRepo)(nil)
