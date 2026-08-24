package postgres

import (
	"context"
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
