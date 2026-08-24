// Package admin owns read-only operational queries exposed to administrators.
package admin

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type UserSummary struct {
	PublicID             uuid.UUID
	DisplayName          string
	Role                 string
	Status               string
	CreatedAt            time.Time
	LastLoginAt          *time.Time
	AccountCount         int
	TaskCount            int
	EntitlementExpiresAt *time.Time
}

type Repository interface {
	ListUserSummaries(ctx context.Context, limit int) ([]UserSummary, error)
}

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) ListUsers(ctx context.Context, limit int) ([]UserSummary, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	return s.repo.ListUserSummaries(ctx, limit)
}
