package entitlement

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// PlanRepository persists entitlement plans.
type PlanRepository interface {
	CreatePlan(ctx context.Context, p *Plan) error
	GetPlanByID(ctx context.Context, id int64) (*Plan, error)
	GetPlanByPublicID(ctx context.Context, publicID uuid.UUID) (*Plan, error)
	ListPlans(ctx context.Context) ([]*Plan, error)
	DisablePlan(ctx context.Context, actorID int64, publicID uuid.UUID) error
}

type PlanPageRepository interface {
	ListPlansPage(ctx context.Context, filter PlanListFilter) ([]*Plan, error)
}

// BatchRepository persists card batches and their codes.
type BatchRepository interface {
	CreateBatch(ctx context.Context, b *CardBatch) error
	InsertCodes(ctx context.Context, batchID int64, codes []*CardCode) error
	ListSummaries(ctx context.Context, limit int) ([]CardBatchSummary, error)
	GetSummaryByPublicID(ctx context.Context, publicID uuid.UUID) (CardBatchSummary, error)
	DisableBatch(ctx context.Context, actorID int64, publicID uuid.UUID) error
	ListCodeSummaries(ctx context.Context, batchPublicID uuid.UUID, limit int) ([]CardCodeSummary, error)
	RevokeUnusedCode(ctx context.Context, actorID int64, batchPublicID uuid.UUID, codeID int64, reason string) error
	// GetCodeByHashForUpdate joins code + batch + plan, locked for update.
	GetCodeByHashForUpdate(ctx context.Context, hash []byte) (*CardCode, error)
	MarkCodeRedeemed(ctx context.Context, codeID, userID int64, at time.Time) error
}

// GrantRepository persists grants and computes the effective entitlement.
type GrantRepository interface {
	CreateGrant(ctx context.Context, g *Grant) error
	GetLastNonRevokedGrant(ctx context.Context, userID int64) (*Grant, error)
	GetEffectiveGrant(ctx context.Context, userID int64, now time.Time) (*Grant, bool, error)
	GetGrantBySourceCardID(ctx context.Context, cardID int64) (*Grant, error)
	RevokeGrant(ctx context.Context, grantID int64, byUserID int64, reason string) error
	ListRedemptionSummaries(ctx context.Context, limit int) ([]RedemptionSummary, error)
	ListUserGrantSummaries(ctx context.Context, userID int64, limit int) ([]RedemptionSummary, error)
	GetGrantByPublicID(ctx context.Context, publicID uuid.UUID) (*Grant, error)
	RevokeGrantByPublicID(ctx context.Context, actorID int64, publicID uuid.UUID, reason string) error
}

type BatchPageRepository interface {
	ListSummariesPage(ctx context.Context, filter BatchListFilter) ([]CardBatchSummary, error)
	ListCodeSummariesPage(ctx context.Context, batchPublicID uuid.UUID, filter CardCodeListFilter) ([]CardCodeSummary, error)
}

type GrantPageRepository interface {
	ListRedemptionSummariesPage(ctx context.Context, filter RedemptionListFilter) ([]RedemptionSummary, error)
}

// UsageRepository atomically reserves/updates daily send counters.
type UsageRepository interface {
	// ReserveDailySend atomically increments the reservation iff below the
	// limit. Returns (reserved bool, err).
	ReserveDailySend(ctx context.Context, userID int64, localDate string, limit int) (bool, error)
	GetDailyUsage(ctx context.Context, userID int64, localDate string) (*DailyUsage, error)
	IncrSucceeded(ctx context.Context, userID int64, localDate string) error
	IncrFailed(ctx context.Context, userID int64, localDate string) error
	// ReleaseDailySend decrements a reservation (partial refund on cancel).
	ReleaseDailySend(ctx context.Context, userID int64, localDate string) error
}

// AuditSink records admin/user actions (audit_logs).
type AuditSink interface {
	Record(ctx context.Context, actorID *int64, action, resourceType, resourceID string, detail map[string]any) error
}
