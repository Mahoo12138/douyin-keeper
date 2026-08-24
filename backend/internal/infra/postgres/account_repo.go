package postgres

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

// AccountRepo implements account.Repository plus the lookup slices used by
// task/send services.
type AccountRepo struct {
	pool *pgxpool.Pool
}

func NewAccountRepo(pool *pgxpool.Pool) *AccountRepo { return &AccountRepo{pool: pool} }

const accountCols = `a.id, a.public_id, a.user_id, u.public_id, a.platform_user_id, a.nickname, a.avatar_url,
	a.binding_status, a.session_status, a.risk_status, a.paused_at, a.cooldown_until,
	a.last_session_check_at, a.last_friend_sync_at, a.created_at, a.updated_at, a.deleted_at`

func scanAccount(row pgx.Row) (*account.Account, error) {
	var a account.Account
	err := row.Scan(&a.ID, &a.PublicID, &a.UserID, &a.UserPublicID, &a.PlatformUserID, &a.Nickname, &a.AvatarURL,
		&a.BindingStatus, &a.SessionStatus, &a.RiskStatus, &a.PausedAt, &a.CooldownUntil,
		&a.LastSessionCheckAt, &a.LastFriendSyncAt, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *AccountRepo) ListOwned(ctx context.Context, userID int64) ([]*account.Account, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+accountCols+` FROM douyin_accounts a
		JOIN users u ON u.id = a.user_id
		WHERE a.user_id=$1 AND a.deleted_at IS NULL
		ORDER BY a.id DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*account.Account
	for rows.Next() {
		a, err := scanAccount(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *AccountRepo) GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*account.Account, error) {
	a, err := scanAccount(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+accountCols+` FROM douyin_accounts a
		JOIN users u ON u.id = a.user_id
		WHERE a.public_id=$1 AND a.user_id=$2 AND a.deleted_at IS NULL`, publicID, userID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "account not found")
	}
	return a, nil
}

func (r *AccountRepo) GetByID(ctx context.Context, accountID int64) (*account.Account, error) {
	a, err := scanAccount(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+accountCols+` FROM douyin_accounts a
		JOIN users u ON u.id = a.user_id
		WHERE a.id=$1 AND a.deleted_at IS NULL`, accountID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "account not found")
	}
	return a, nil
}

func (r *AccountRepo) Create(ctx context.Context, a *account.Account) error {
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO douyin_accounts (public_id, user_id, binding_status, session_status, risk_status, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id`, a.PublicID, a.UserID, a.BindingStatus, a.SessionStatus, a.RiskStatus, a.CreatedAt, a.UpdatedAt).Scan(&a.ID)
}

func (r *AccountRepo) SetBindingStatus(ctx context.Context, accountID int64, status account.BindingStatus) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE douyin_accounts SET binding_status=$2, updated_at=now() WHERE id=$1`, accountID, status)
	return err
}

func (r *AccountRepo) SetIdentity(ctx context.Context, accountID int64, platformUserID, nickname string, avatarURL *string) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE douyin_accounts SET platform_user_id=$2, nickname=$3, avatar_url=$4, updated_at=now()
		WHERE id=$1 AND deleted_at IS NULL`, accountID, platformUserID, nickname, avatarURL)
	return err
}

func (r *AccountRepo) SetPaused(ctx context.Context, accountID int64, at *time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE douyin_accounts SET paused_at=$2, updated_at=now() WHERE id=$1`, accountID, at)
	return err
}

func (r *AccountRepo) SetRiskStatus(ctx context.Context, accountID int64, risk account.RiskStatus, cooldownUntil *time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE douyin_accounts SET risk_status=$2, cooldown_until=$3, updated_at=now() WHERE id=$1`,
		accountID, risk, cooldownUntil)
	return err
}

// ClearExpiredRiskCooldowns returns accounts whose platform cooldown has
// elapsed to the normal risk state. The bounded CTE keeps scheduler cleanup
// work small and safe when multiple leaders overlap.
func (r *AccountRepo) ClearExpiredRiskCooldowns(ctx context.Context, now time.Time, limit int) (int, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		WITH expired AS (
			SELECT id FROM douyin_accounts
			WHERE risk_status = 'cooling_down'
			  AND cooldown_until IS NOT NULL AND cooldown_until <= $1
			  AND deleted_at IS NULL
			ORDER BY id
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		UPDATE douyin_accounts a
		SET risk_status = 'normal', cooldown_until = NULL, updated_at = $1
		FROM expired
		WHERE a.id = expired.id
		RETURNING a.id`, now, limit)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return count, err
		}
		count++
	}
	return count, rows.Err()
}

func (r *AccountRepo) SetSessionStatus(ctx context.Context, accountID int64, status account.SessionStatus, checkedAt time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE douyin_accounts SET session_status=$2, last_session_check_at=$3, updated_at=now() WHERE id=$1`,
		accountID, status, checkedAt)
	return err
}

func (r *AccountRepo) SetLastFriendSyncAt(ctx context.Context, accountID int64, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE douyin_accounts SET last_friend_sync_at=$2, updated_at=now() WHERE id=$1`, accountID, at)
	return err
}

func (r *AccountRepo) SoftDelete(ctx context.Context, accountID int64) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE douyin_accounts SET deleted_at=now(), updated_at=now() WHERE id=$1`, accountID)
	return err
}

func (r *AccountRepo) CountQuotaOccupied(ctx context.Context, userID int64) (int, error) {
	var n int
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT COUNT(*) FROM douyin_accounts
		WHERE user_id=$1 AND deleted_at IS NULL AND binding_status IN ('binding','bound')`, userID).Scan(&n)
	return n, err
}

// --- cross-context counts (entitlement.ResourceCounters) ---

// CountAccountsOccupied is the account half of entitlement.ResourceCounters
// (docs/13 §10.1). The combined counters type lives in cmd/api.
func (r *AccountRepo) CountAccountsOccupied(ctx context.Context, userID int64) (int, error) {
	return r.CountQuotaOccupied(ctx, userID)
}
