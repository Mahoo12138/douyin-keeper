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

// SummaryRepository is an optional read projection used by the C-side account
// list. Keeping it separate preserves the lean Account lookup used by workers.
type SummaryRepository interface {
	ListOwnedSummary(ctx context.Context, userID int64) ([]*Summary, error)
}

type SummaryListFilter struct {
	Limit   int
	AfterID int64
}

type SummaryListPage struct {
	Items       []*Summary
	NextAfterID int64
}

// SummaryPageRepository is the API-facing cursor projection. The legacy
// summary method remains available for internal callers needing a snapshot.
type SummaryPageRepository interface {
	ListOwnedSummaryPage(ctx context.Context, userID int64, filter SummaryListFilter) ([]*Summary, error)
}

// SessionCheckTarget is a bound account that needs a periodic login-state
// validation. Scheduler reads this projection so it does not depend on the
// user-facing account list query.
type SessionCheckTarget struct {
	AccountID int64
	PublicID  uuid.UUID
	UserID    int64
}

// SessionCheckRepository is the scheduler slice for proactive session checks.
// The repository excludes accounts with a recent or active check job so a
// slow browser worker cannot cause a new job on every scheduler tick.
type SessionCheckRepository interface {
	ListStaleSessionCheckTargets(ctx context.Context, before time.Time, limit int) ([]SessionCheckTarget, error)
}
