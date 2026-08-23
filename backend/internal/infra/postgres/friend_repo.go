package postgres

import (
	"context"

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

var _ friend.Repository = (*FriendRepo)(nil)