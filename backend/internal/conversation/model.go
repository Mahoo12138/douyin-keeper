// Package conversation owns the user-visible conversation index. Conversation
// IDs are platform routing data; display names remain diagnostic only.
package conversation

import (
	"context"
	"time"

	"github.com/google/uuid"
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
}

type ListFilter struct {
	Limit int
}

type Repository interface {
	ListByAccountOwned(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter ListFilter) ([]*Conversation, error)
}

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service { return &Service{repo: repo} }

func (s *Service) ListForAccount(ctx context.Context, userID int64, accountPublicID uuid.UUID, filter ListFilter) ([]*Conversation, error) {
	if filter.Limit <= 0 || filter.Limit > 100 {
		filter.Limit = 100
	}
	return s.repo.ListByAccountOwned(ctx, userID, accountPublicID, filter)
}
