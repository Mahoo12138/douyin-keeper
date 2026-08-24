package notification

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

const (
	defaultListLimit = 50
	maxListLimit     = 100
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service { return &Service{repo: repo} }

func (s *Service) List(ctx context.Context, userID int64, filter ListFilter) ([]*Notification, int, error) {
	if userID <= 0 {
		return nil, 0, ErrInvalidUser
	}
	filter.Limit = normalizeLimit(filter.Limit)
	return s.repo.List(ctx, userID, filter)
}

func (s *Service) MarkRead(ctx context.Context, userID int64, publicID uuid.UUID) error {
	if userID <= 0 || publicID == uuid.Nil {
		return ErrInvalidUser
	}
	updated, err := s.repo.MarkRead(ctx, userID, publicID)
	if err != nil {
		return err
	}
	if !updated {
		return apperr.NotFound(apperr.CodeNotFound, "notification not found")
	}
	return nil
}

func (s *Service) MarkAllRead(ctx context.Context, userID int64) (int, error) {
	if userID <= 0 {
		return 0, ErrInvalidUser
	}
	return s.repo.MarkAllRead(ctx, userID)
}

func (s *Service) Create(ctx context.Context, item *Notification) error {
	if item == nil || item.UserID <= 0 || item.Title == "" || item.Body == "" {
		return fmt.Errorf("notification: invalid notification")
	}
	return s.repo.Create(ctx, item)
}

func (s *Service) GetPreferences(ctx context.Context, userID int64) (*Preferences, error) {
	if userID <= 0 {
		return nil, ErrInvalidUser
	}
	return s.repo.GetPreferences(ctx, userID)
}

func (s *Service) SetWechatEnabled(ctx context.Context, userID int64, enabled bool) (*Preferences, error) {
	if userID <= 0 {
		return nil, ErrInvalidUser
	}
	return s.repo.SetWechatEnabled(ctx, userID, enabled, time.Now())
}

func normalizeLimit(limit int) int {
	if limit <= 0 {
		return defaultListLimit
	}
	if limit > maxListLimit {
		return maxListLimit
	}
	return limit
}
