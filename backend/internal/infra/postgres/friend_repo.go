package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
)

type FriendRepo struct {
	pool *pgxpool.Pool
}

func NewFriendRepo(pool *pgxpool.Pool) *FriendRepo { return &FriendRepo{pool: pool} }

const friendCols = `f.id, f.public_id, f.account_id, f.platform_user_id, f.identity_status,
	f.display_name, f.nickname, f.short_id, f.avatar_url, f.streak_days, f.has_conversation,
	f.spark_enabled, f.last_seen_at, f.last_sent_at, f.created_at, f.updated_at, f.deleted_at`

func scanFriend(row pgx.Row) (*friend.Friend, error) {
	var f friend.Friend
	err := row.Scan(&f.ID, &f.PublicID, &f.AccountID, &f.PlatformUserID, &f.IdentityStatus,
		&f.DisplayName, &f.Nickname, &f.ShortID, &f.AvatarURL, &f.StreakDays, &f.HasConversation,
		&f.SparkEnabled, &f.LastSeenAt, &f.LastSentAt, &f.CreatedAt, &f.UpdatedAt, &f.DeletedAt)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// ListByAccountOwned stays inside the user's account scope (docs/09 §11).
func (r *FriendRepo) ListByAccountOwned(ctx context.Context, userID int64, accountPublicID uuid.UUID) ([]*friend.Friend, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+friendCols+`
		FROM friends f
		JOIN douyin_accounts a ON a.id = f.account_id
		WHERE a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL AND f.deleted_at IS NULL
		ORDER BY f.last_sent_at DESC NULLS LAST, f.display_name
	`, accountPublicID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*friend.Friend
	for rows.Next() {
		f, err := scanFriend(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (r *FriendRepo) ListByAccountOwnedPage(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter friend.ListFilter) ([]*friend.Friend, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+friendCols+`
		FROM friends f
		JOIN douyin_accounts a ON a.id = f.account_id
		WHERE a.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL AND f.deleted_at IS NULL
		  AND ($3::bigint = 0 OR f.id < $3)
		ORDER BY f.id DESC
		LIMIT $4`, accountPublicID, userID, filter.AfterID, filter.Limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*friend.Friend, 0, filter.Limit+1)
	for rows.Next() {
		item, err := scanFriend(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *FriendRepo) GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*friend.Friend, error) {
	f, err := scanFriend(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+friendCols+`
		FROM friends f
		JOIN douyin_accounts a ON a.id = f.account_id
		WHERE f.public_id = $1 AND a.user_id = $2
		  AND a.deleted_at IS NULL AND f.deleted_at IS NULL
	`, publicID, userID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "friend not found")
	}
	return f, nil
}

func (r *FriendRepo) UpdateSparkEnabled(ctx context.Context, friendID int64, enabled bool) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE friends SET spark_enabled=$2, updated_at=now() WHERE id=$1 AND deleted_at IS NULL`,
		friendID, enabled)
	return err
}

func (r *FriendRepo) GetSendTarget(ctx context.Context, accountID, friendID int64) (*friend.SendTarget, error) {
	var target friend.SendTarget
	var platformUserID *string
	var identityStatus friend.IdentityStatus
	if err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT platform_user_id, identity_status
		FROM friends
		WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL`, friendID, accountID).
		Scan(&platformUserID, &identityStatus); err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "friend not found")
	}
	if platformUserID == nil || *platformUserID == "" || identityStatus != friend.IdentityResolved {
		return nil, apperr.New(apperr.CodeFriendIdentityUnsolid, apperr.KindConflict, "friend identity is unresolved")
	}
	if err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT platform_conversation_id, channel
		FROM conversations
		WHERE account_id=$1 AND friend_id=$2
		ORDER BY updated_at DESC LIMIT 1`, accountID, friendID).
		Scan(&target.PlatformConversationID, &target.Channel); err != nil {
		return nil, mapNoRows(err, apperr.CodeConversationNotFound, "conversation not found")
	}
	target.PlatformUserID = *platformUserID
	return &target, nil
}

func (r *FriendRepo) HasConversation(ctx context.Context, accountID, friendID int64) (bool, error) {
	var exists bool
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM conversations
			WHERE account_id=$1 AND friend_id=$2
		)`, accountID, friendID).Scan(&exists)
	return exists, err
}

func (r *FriendRepo) MarkLastSent(ctx context.Context, friendID int64, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE friends SET last_sent_at=$2, updated_at=$2 WHERE id=$1 AND deleted_at IS NULL`, friendID, at)
	return err
}

// SyncBatch applies one complete friends.list result. The caller supplies a
// transaction context; user-owned fields such as spark_enabled and
// last_sent_at are deliberately omitted from every update.
func (r *FriendRepo) SyncBatch(ctx context.Context, accountID int64, items []friend.SyncItem, seenPlatformIDs, seenConversationIDs []string, at time.Time) error {
	if _, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE friends f SET deleted_at=$2, updated_at=$2
		WHERE f.account_id=$1 AND f.platform_user_id IS NULL AND f.deleted_at IS NULL
		  AND NOT EXISTS (
			SELECT 1 FROM conversations c
			WHERE c.friend_id=f.id AND c.account_id=f.account_id
		  )`, accountID, at); err != nil {
		return err
	}
	if _, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE friends f SET deleted_at=$2, updated_at=$2
		WHERE f.account_id=$1 AND f.platform_user_id IS NULL AND f.deleted_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM conversations c
			WHERE c.friend_id=f.id AND c.account_id=f.account_id
		  )
		  AND NOT EXISTS (
			SELECT 1 FROM conversations c
			WHERE c.friend_id=f.id AND c.account_id=f.account_id
			  AND c.platform_conversation_id = ANY($3::text[])
		  )`, accountID, at, seenConversationIDs); err != nil {
		return err
	}
	for _, item := range items {
		friendID, err := r.upsertFriend(ctx, accountID, item, at)
		if err != nil {
			return err
		}
		if item.Conversation != nil && item.Conversation.PlatformConversationID != "" {
			if err := r.upsertConversation(ctx, accountID, friendID, *item.Conversation, at); err != nil {
				return err
			}
		}
	}
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE friends SET deleted_at=$2, updated_at=$2
		WHERE account_id=$1 AND platform_user_id IS NOT NULL AND deleted_at IS NULL
		  AND NOT (platform_user_id = ANY($3::text[]))`, accountID, at, seenPlatformIDs)
	return err
}

func (r *FriendRepo) upsertFriend(ctx context.Context, accountID int64, item friend.SyncItem, at time.Time) (int64, error) {
	var id int64
	if item.PlatformUserID != nil && *item.PlatformUserID != "" {
		err := From(ctx, r.pool).QueryRow(ctx, `
			UPDATE friends SET identity_status=$3, display_name=$4, nickname=$5,
				short_id=$6, avatar_url=$7, streak_days=$8, has_conversation=$9,
				updated_at=$10, last_seen_at=$10, deleted_at=NULL
			WHERE account_id=$1 AND platform_user_id=$2
			RETURNING id`, accountID, *item.PlatformUserID, resolvedStatus(item), item.DisplayName,
			item.Nickname, item.ShortID, item.AvatarURL, item.StreakDays, hasConversation(item), at).Scan(&id)
		if err == nil {
			return id, nil
		}
		if err != pgx.ErrNoRows {
			return 0, err
		}
	} else if item.Conversation != nil && item.Conversation.PlatformConversationID != "" {
		err := From(ctx, r.pool).QueryRow(ctx, `
			SELECT f.id FROM friends f
			JOIN conversations c ON c.friend_id=f.id AND c.account_id=f.account_id
			WHERE f.account_id=$1 AND c.platform_conversation_id=$2
			ORDER BY f.deleted_at NULLS FIRST, f.id LIMIT 1`, accountID, item.Conversation.PlatformConversationID).Scan(&id)
		if err == nil {
			if err := r.updateFriend(ctx, accountID, id, item, at); err != nil {
				return 0, err
			}
			return id, nil
		}
		if err != pgx.ErrNoRows {
			return 0, err
		}
	}
	return r.insertFriend(ctx, accountID, item, at)
}

func (r *FriendRepo) updateFriend(ctx context.Context, accountID, id int64, item friend.SyncItem, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE friends SET platform_user_id=$3, identity_status=$4, display_name=$5,
			nickname=$6, short_id=$7, avatar_url=$8, streak_days=$9,
			has_conversation=$10, updated_at=$11, last_seen_at=$11, deleted_at=NULL
		WHERE id=$1 AND account_id=$2`, id, accountID, item.PlatformUserID, resolvedStatus(item), item.DisplayName,
		item.Nickname, item.ShortID, item.AvatarURL, item.StreakDays, hasConversation(item), at)
	return err
}

func (r *FriendRepo) insertFriend(ctx context.Context, accountID int64, item friend.SyncItem, at time.Time) (int64, error) {
	var id int64
	err := From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO friends (public_id, account_id, platform_user_id, identity_status,
			display_name, nickname, short_id, avatar_url, streak_days, has_conversation,
			last_seen_at, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$11)
		RETURNING id`, uuid.New(), accountID, item.PlatformUserID, resolvedStatus(item), item.DisplayName,
		item.Nickname, item.ShortID, item.AvatarURL, item.StreakDays, hasConversation(item), at).Scan(&id)
	return id, err
}

func (r *FriendRepo) upsertConversation(ctx context.Context, accountID, friendID int64, item friend.ConversationSnapshot, at time.Time) error {
	channel := item.Channel
	if channel != "consumer" && channel != "creator" {
		return fmt.Errorf("friend sync: unsupported conversation channel %q", channel)
	}
	_, err := From(ctx, r.pool).Exec(ctx, `
		INSERT INTO conversations (public_id, account_id, friend_id, platform_conversation_id,
			channel, last_synced_at, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$6,$6)
		ON CONFLICT (account_id, platform_conversation_id) DO UPDATE SET
			friend_id=EXCLUDED.friend_id, channel=EXCLUDED.channel,
			last_synced_at=EXCLUDED.last_synced_at, updated_at=EXCLUDED.updated_at`,
		uuid.New(), accountID, friendID, item.PlatformConversationID, channel, at)
	return err
}

func resolvedStatus(item friend.SyncItem) friend.IdentityStatus {
	if item.PlatformUserID != nil && *item.PlatformUserID != "" {
		return friend.IdentityResolved
	}
	if item.IdentityStatus == "" {
		return friend.IdentityPending
	}
	return item.IdentityStatus
}

func hasConversation(item friend.SyncItem) bool {
	return item.HasConversation || item.Conversation != nil
}

var _ friend.Repository = (*FriendRepo)(nil)
var _ friend.PageRepository = (*FriendRepo)(nil)
