// Package entitlement owns plans, card batches/codes, grants and the
// effective-authorization policy (docs/12, docs/13 §8–§12). It deliberately
// holds no payment concepts. It depends on small injected counter interfaces
// for cross-context quotas and never touches concrete account/task repos.
package entitlement

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusActive   Status = "active"
	StatusDisabled Status = "disabled"
)

// GrantSourceType links a grant to its origin.
type GrantSourceType string

const (
	SourceCard  GrantSourceType = "card"
	SourceAdmin GrantSourceType = "admin"
)

type Plan struct {
	ID             int64
	PublicID       uuid.UUID
	Code           string // stable | standard | pro
	Name           string
	Status         Status
	AccountQuota   int
	TaskQuota      int
	DailySendQuota int
	Features       map[string]bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type CardBatch struct {
	ID                int64
	PublicID          uuid.UUID
	EntitlementPlanID int64
	Name              string
	DurationDays      int
	Quantity          int
	Status            Status
	CodeVersion       int
	RedeemNotBefore   *time.Time
	RedeemBefore      *time.Time
	CreatedBy         int64
	Note              string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type CardBatchSummary struct {
	CardBatch
	PlanCode             string
	PlanName             string
	CreatedByDisplayName string
	UnusedCount          int
	RedeemedCount        int
	RevokedCount         int
}

type RedemptionSummary struct {
	GrantPublicID   uuid.UUID
	UserPublicID    uuid.UUID
	UserDisplayName string
	PlanPublicID    uuid.UUID
	PlanCode        string
	PlanName        string
	SourceType      GrantSourceType
	StartsAt        time.Time
	ExpiresAt       time.Time
	RedeemedAt      *time.Time
	RevokedAt       *time.Time
	RevokeReason    *string
	CodeFingerprint *string
	CreatedAt       time.Time
}

type CardCodeSummary struct {
	ID              int64
	CodeFingerprint string
	Status          string
	RedeemedAt      *time.Time
	RevokedAt       *time.Time
	CreatedAt       time.Time
}

type CardCode struct {
	ID              int64
	BatchID         int64
	CodeHash        []byte
	CodeFingerprint string
	Status          string // unused | redeemed | revoked
	RedeemedBy      *int64
	RedeemedAt      *time.Time
	RevokedAt       *time.Time
	CreatedAt       time.Time

	// Joined from batch+plan for redeem.
	Plan  *Plan
	Batch *CardBatch
}

type Grant struct {
	ID                int64
	PublicID          uuid.UUID
	UserID            int64
	EntitlementPlanID int64
	SourceType        GrantSourceType
	SourceCardID      *int64
	StartsAt          time.Time
	ExpiresAt         time.Time
	RevokedAt         *time.Time
	RevokeReason      *string
	CreatedAt         time.Time

	Plan *Plan // joined
}

// EffectiveEntitlement is the API-visible authorization snapshot.
type EffectiveEntitlement struct {
	Active         bool
	GrantID        *uuid.UUID
	PlanCode       string
	StartsAt       *time.Time
	ExpiresAt      *time.Time
	AccountQuota   int
	TaskQuota      int
	DailySendQuota int
	Features       map[string]bool

	Usage EntitlementUsage
}

type EntitlementUsage struct {
	AccountsUsed      int
	TasksUsed         int
	DailySendReserved int
	QuotaLocalDate    string // yyyy-mm-dd
}

// DailyUsage is the per-user per-local-day send counter (docs/13 §10.3).
type DailyUsage struct {
	UserID             int64
	LocalDate          string
	ReservedSendCount  int
	SucceededSendCount int
	FailedSendCount    int
}

// ResourceCounters lets entitlement compute account/task usage without
// depending on account/task repositories (docs/14 §4).
type ResourceCounters interface {
	CountAccountsOccupied(ctx context.Context, userID int64) (int, error)
	CountTasks(ctx context.Context, userID int64) (int, error)
}

// Action constants for authorization requests (docs/13 §9).
const (
	ActionAccountBind = "account.bind"
	ActionFriendsSync = "friends.sync"
	ActionTaskCreate  = "task.create"
	ActionSendExecute = "send.execute"
)

const FeatureCreatorFirstMessage = "creator_first_message"

type AuthorizationRequest struct {
	UserID          int64
	Action          string
	RequiredFeature string // may be empty
}

type AuthorizationDecision struct {
	Allowed     bool
	ReasonCode  string
	Entitlement *EffectiveEntitlement
}
