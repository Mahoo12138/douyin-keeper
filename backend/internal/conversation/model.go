// Package conversation owns the user-visible conversation index. Conversation
// IDs are platform routing data; display names remain diagnostic only.
package conversation

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

type Conversation struct {
	// InternalID is only used by the cursor projection. It is never exposed by
	// the HTTP view; public callers use ID instead.
	InternalID             int64
	ID                     uuid.UUID
	AccountID              uuid.UUID
	FriendID               *uuid.UUID
	FriendDisplayName      string
	FriendNickname         string
	FriendAvatarURL        *string
	StreakDays             int
	StreakActivatedToday   *bool
	SparkEnabled           bool
	LastSentAt             *time.Time
	PlatformIdentityStatus string
	ConversationType       string
	SparkSupported         bool
	LastMessageAt          *time.Time
	LastSyncedAt           *time.Time
	ArchivedAt             *time.Time
}

type ListFilter struct {
	Limit           int
	AfterID         int64
	IncludeArchived bool
	GroupOnly       bool
}

type ListPage struct {
	Items       []*Conversation
	NextAfterID int64
}

// SyncItem is the adapter-neutral snapshot returned by conversations.list.
// Platform IDs are the only identity keys; display names are refreshed for
// presentation only.
type SyncItem struct {
	PlatformConversationID string
	PlatformUserID         string
	DisplayName            string
	AvatarURL              string
	ConversationType       string
	LastMessageAt          *time.Time
	StreakDays             *int
	StreakActivatedToday   *bool
}

// SyncRepository is the worker-only write slice for a complete conversation
// crawl. It intentionally does not expose bulk mutation to HTTP handlers.
type SyncRepository interface {
	SyncBatch(ctx context.Context, accountID int64, items []SyncItem, at time.Time) error
}

// SnapshotSyncRepository applies a complete message-panel snapshot and
// archives rows that were not present after the panel was fully scrolled.
type SnapshotSyncRepository interface {
	SyncSnapshot(ctx context.Context, accountID int64, items []SyncItem, at time.Time) error
}

// GroupSyncRepository replaces the account's group snapshot while preserving
// the platform conversation ID as the routing key. It is intentionally an
// optional extension so other conversation sync implementations can continue
// to use SyncRepository.
type GroupSyncRepository interface {
	ReplaceGroupBatch(ctx context.Context, accountID int64, items []SyncItem, at time.Time) error
}

type Repository interface {
	ListByAccountOwned(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter ListFilter) ([]*Conversation, error)
	SetArchived(ctx context.Context, userID int64, accountPublicID, conversationPublicID uuid.UUID, archived bool, at time.Time) (*Conversation, error)
}

// PageRepository is the API-facing cursor projection. The legacy repository
// method remains available for callers that need the complete account list.
type PageRepository interface {
	ListByAccountOwnedPage(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter ListFilter) ([]*Conversation, error)
}

// PlatformArchiveTarget is the internal, non-HTTP projection used to start a
// platform archive Job. Platform identifiers stay inside the Job/Sidecar
// boundary and are never returned by the user-facing conversation view.
type PlatformArchiveTarget struct {
	ConversationID         int64
	ConversationPublicID   uuid.UUID
	AccountID              int64
	AccountPublicID        uuid.UUID
	UserID                 int64
	PlatformUserID         *string
	PlatformConversationID string
}

type PlatformArchiveRepository interface {
	GetPlatformArchiveTargetOwned(ctx context.Context, userID int64, accountPublicID, conversationPublicID uuid.UUID) (*PlatformArchiveTarget, error)
}

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service { return &Service{repo: repo} }

func (s *Service) ListForAccount(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter ListFilter) ([]*Conversation, error) {
	if userID <= 0 || accountPublicID == uuid.Nil {
		return nil, apperr.Validation(apperr.CodeConflict, "invalid conversation scope")
	}
	if filter.Limit <= 0 || filter.Limit > 100 {
		filter.Limit = 100
	}
	return s.repo.ListByAccountOwned(ctx, userID, accountPublicID, filter)
}

func (s *Service) ListPageForAccount(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter ListFilter) (ListPage, error) {
	if userID <= 0 || accountPublicID == uuid.Nil {
		return ListPage{}, apperr.Validation(apperr.CodeConflict, "invalid conversation scope")
	}
	filter = normalizePageFilter(filter)
	if repo, ok := s.repo.(PageRepository); ok {
		items, err := repo.ListByAccountOwnedPage(ctx, userID, accountPublicID, filter)
		if err != nil {
			return ListPage{}, err
		}
		return trimPage(items, filter.Limit), nil
	}
	items, err := s.repo.ListByAccountOwned(ctx, userID, accountPublicID, filter)
	if err != nil {
		return ListPage{}, err
	}
	if filter.AfterID > 0 {
		start := len(items)
		for index, item := range items {
			if item != nil && item.InternalID < filter.AfterID {
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
	return trimPage(items, filter.Limit), nil
}

func normalizePageFilter(filter ListFilter) ListFilter {
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

func trimPage(items []*Conversation, limit int) ListPage {
	page := ListPage{Items: items}
	if len(items) <= limit {
		return page
	}
	page.Items = items[:limit]
	if last := page.Items[len(page.Items)-1]; last != nil {
		page.NextAfterID = last.InternalID
	}
	return page
}

func (s *Service) SetArchived(ctx context.Context, userID int64, accountPublicID, conversationPublicID uuid.UUID, archived bool) (*Conversation, error) {
	if userID <= 0 || accountPublicID == uuid.Nil || conversationPublicID == uuid.Nil {
		return nil, apperr.Validation(apperr.CodeConflict, "invalid conversation id")
	}
	return s.repo.SetArchived(ctx, userID, accountPublicID, conversationPublicID, archived, time.Now())
}
