package postgres

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

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
			c.channel, c.last_message_at, c.last_synced_at
		FROM conversations c
		JOIN douyin_accounts a ON a.id = c.account_id
		JOIN friends f ON f.id = c.friend_id AND f.account_id = c.account_id
		WHERE a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL AND f.deleted_at IS NULL
		ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC, c.id DESC
		LIMIT $3`, accountPublicID, userID, filter.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*conversation.Conversation, 0)
	for rows.Next() {
		item := new(conversation.Conversation)
		if err := rows.Scan(&item.ID, &item.AccountID, &item.FriendID,
			&item.FriendDisplayName, &item.FriendNickname, &item.FriendAvatarURL,
			&item.PlatformIdentityStatus, &item.Channel, &item.LastMessageAt, &item.LastSyncedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

var _ conversation.Repository = (*ConversationRepo)(nil)
