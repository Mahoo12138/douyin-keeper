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
	ID                     uuid.UUID
	AccountID              uuid.UUID
	FriendID               uuid.UUID
	FriendDisplayName      string
	FriendNickname         string
	FriendAvatarURL        *string
	PlatformIdentityStatus string
	Channel                string
	LastMessageAt          *time.Time
	LastSyncedAt           *time.Time
	ArchivedAt             *time.Time
}

type ListFilter struct {
	Limit           int
	IncludeArchived bool
}

type Repository interface {
	ListByAccountOwned(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter ListFilter) ([]*Conversation, error)
	SetArchived(ctx context.Context, userID int64, accountPublicID, conversationPublicID uuid.UUID, archived bool, at time.Time) (*Conversation, error)
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

func (s *Service) SetArchived(ctx context.Context, userID int64, accountPublicID, conversationPublicID uuid.UUID, archived bool) (*Conversation, error) {
	if userID <= 0 || accountPublicID == uuid.Nil || conversationPublicID == uuid.Nil {
		return nil, apperr.Validation(apperr.CodeConflict, "invalid conversation id")
	}
	return s.repo.SetArchived(ctx, userID, accountPublicID, conversationPublicID, archived, time.Now())
}
