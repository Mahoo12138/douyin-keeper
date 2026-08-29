// Package friend owns the Friend entity and its stable platform identity
// (docs/05 §5). platform_user_id is the send-routing key; display/nickname are
// display-only and never used for targeting.
package friend

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
)

type IdentityStatus string

const (
	IdentityPending   IdentityStatus = "pending"
	IdentityResolved  IdentityStatus = "resolved"
	IdentityAmbiguous IdentityStatus = "ambiguous"
	IdentityMissing   IdentityStatus = "missing"
)

type Friend struct {
	ID              int64
	PublicID        uuid.UUID
	AccountID       int64
	PlatformUserID  *string
	IdentityStatus  IdentityStatus
	DisplayName     string
	Nickname        string
	ShortID         *string
	AvatarURL       *string
	StreakDays      int
	HasConversation bool
	SparkEnabled    bool
	LastSeenAt      *time.Time
	LastSentAt      *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
	DeletedAt       *time.Time
}

// SyncItem is the adapter-neutral friend snapshot returned by friends.list.
// PlatformUserID is the only stable send-routing key; all display fields are
// refreshed during a sync and are never used as an upsert key.
type SyncItem struct {
	PlatformUserID  *string
	IdentityStatus  IdentityStatus
	DisplayName     string
	Nickname        string
	ShortID         *string
	AvatarURL       *string
	StreakDays      int
	HasConversation bool
	Conversation    *ConversationSnapshot
}

type ConversationSnapshot struct {
	PlatformConversationID string
}

type ListFilter struct {
	Limit   int
	AfterID int64
}

type ListPage struct {
	Items       []*Friend
	NextAfterID int64
}

// Resolved reports whether automated sending is allowed (docs/09 §5).
func (f *Friend) Resolved() bool { return f.IdentityStatus == IdentityResolved }

type Repository interface {
	// ListByAccountOwned joins through douyin_accounts for user scoping.
	ListByAccountOwned(ctx context.Context, userID int64, accountPublicID uuid.UUID) ([]*Friend, error)
	GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*Friend, error)
	UpdateSparkEnabled(ctx context.Context, friendID int64, enabled bool) error
}

// PageRepository is the API-facing cursor projection. The legacy Repository
// method remains for workers and integration code that need the complete
// account snapshot.
type PageRepository interface {
	ListByAccountOwnedPage(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter ListFilter) ([]*Friend, error)
}

// SyncRepository is the worker-only write slice. It is intentionally
// separate from the user-facing Repository so API handlers cannot mutate a
// whole account's friend set accidentally.
type SyncRepository interface {
	SyncBatch(ctx context.Context, accountID int64, items []SyncItem, seenPlatformIDs, seenConversationIDs []string, at time.Time) error
}

type SendTarget struct {
	PlatformUserID         string
	PlatformConversationID string
}

// SendTargetRepository exposes only the stable, already-resolved routing data
// needed by the send worker. Display names are intentionally absent.
type SendTargetRepository interface {
	GetSendTarget(ctx context.Context, accountID, friendID int64) (*SendTarget, error)
	MarkLastSent(ctx context.Context, friendID int64, at time.Time) error
}

// Gate is the entitlement slice used by the friend service.
type Gate interface {
	Authorize(ctx context.Context, req entitlement.AuthorizationRequest) (entitlement.AuthorizationDecision, error)
}

type Service struct {
	repo Repository
	gate Gate
}

func NewService(repo Repository, gate Gate) *Service { return &Service{repo: repo, gate: gate} }

func (s *Service) ListForAccount(ctx context.Context, userID int64, accountPublicID uuid.UUID) ([]*Friend, error) {
	return s.repo.ListByAccountOwned(ctx, userID, accountPublicID)
}

func (s *Service) ListPageForAccount(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter ListFilter) (ListPage, error) {
	filter = normalizeListFilter(filter)
	if repo, ok := s.repo.(PageRepository); ok {
		items, err := repo.ListByAccountOwnedPage(ctx, userID, accountPublicID, filter)
		if err != nil {
			return ListPage{}, err
		}
		return trimListPage(items, filter.Limit), nil
	}
	items, err := s.repo.ListByAccountOwned(ctx, userID, accountPublicID)
	if err != nil {
		return ListPage{}, err
	}
	if filter.AfterID > 0 {
		start := len(items)
		for index, item := range items {
			if item != nil && item.ID < filter.AfterID {
				start = index
				break
			}
		}
		if start < len(items) {
			items = items[start:]
		} else {
			items = nil
		}
	}
	return trimListPage(items, filter.Limit), nil
}

func normalizeListFilter(filter ListFilter) ListFilter {
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 100 {
		filter.Limit = 100
	}
	if filter.AfterID < 0 {
		filter.AfterID = 0
	}
	return filter
}

func trimListPage(items []*Friend, limit int) ListPage {
	page := ListPage{Items: items}
	if len(items) <= limit {
		return page
	}
	page.Items = items[:limit]
	if last := page.Items[len(page.Items)-1]; last != nil {
		page.NextAfterID = last.ID
	}
	return page
}

func (s *Service) GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*Friend, error) {
	return s.repo.GetOwned(ctx, userID, publicID)
}

// SetSparkEnabled toggles a friend's spark maintenance. Enabling requires an
// active entitlement (a platform action is implied).
func (s *Service) SetSparkEnabled(ctx context.Context, userID int64, publicID uuid.UUID, enabled bool) (*Friend, error) {
	if enabled {
		dec, err := s.gate.Authorize(ctx, entitlement.AuthorizationRequest{UserID: userID, Action: entitlement.ActionTaskCreate})
		if err != nil {
			return nil, err
		}
		if !dec.Allowed {
			switch dec.ReasonCode {
			case apperr.CodeEntitlementRequired, apperr.CodeEntitlementExpired:
				return nil, apperr.New(dec.ReasonCode, apperr.KindForbidden, "active entitlement required to enable sparks")
			default:
				return nil, apperr.New(apperr.CodeForbidden, apperr.KindForbidden, "spark enable not allowed")
			}
		}
	}
	f, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return nil, err
	}
	if enabled && !f.Resolved() {
		return nil, apperr.Conflict(apperr.CodeFriendIdentityUnsolid, "friend identity is not resolved")
	}
	if err := s.repo.UpdateSparkEnabled(ctx, f.ID, enabled); err != nil {
		return nil, err
	}
	f.SparkEnabled = enabled
	return f, nil
}
