package account

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Repository scopes every C-side query by user (docs/14 §7: use GetOwned, not
// Get-then-compare). Admin reads use a separate query type.
type Repository interface {
	ListOwned(ctx context.Context, userID int64) ([]*Account, error)
	GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*Account, error)
	// GetByID is an internal worker lookup. It is not exposed to C-side handlers.
	GetByID(ctx context.Context, accountID int64) (*Account, error)
	Create(ctx context.Context, a *Account) error
	SetBindingStatus(ctx context.Context, accountID int64, status BindingStatus) error
	SetIdentity(ctx context.Context, accountID int64, platformUserID, nickname string, avatarURL *string) error
	SetPaused(ctx context.Context, accountID int64, at *time.Time) error
	SetRiskStatus(ctx context.Context, accountID int64, risk RiskStatus, cooldownUntil *time.Time) error
	SetSessionStatus(ctx context.Context, accountID int64, status SessionStatus, checkedAt time.Time) error
	SetLastFriendSyncAt(ctx context.Context, accountID int64, at time.Time) error
	SoftDelete(ctx context.Context, accountID int64) error
	// CountQuotaOccupied counts binding+bound accounts (docs/13 §10.1).
	CountQuotaOccupied(ctx context.Context, userID int64) (int, error)
}
