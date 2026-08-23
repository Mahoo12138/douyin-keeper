package job

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

// Service is the read/cancel front for generic jobs. Creation happens inside
// resource services' tx (account.CreateBinding etc.).
type Service struct {
	repo Repository
	now  func() time.Time
}

func NewService(repo Repository) *Service { return &Service{repo: repo, now: time.Now} }

func (s *Service) Get(ctx context.Context, userID *int64, publicID uuid.UUID) (*Job, error) {
	return s.repo.GetOwned(ctx, userID, publicID)
}

func (s *Service) Events(ctx context.Context, jobID int64) ([]JobEvent, error) {
	return s.repo.ListEvents(ctx, jobID)
}

// RequestCancel only flags cancellation; the worker performs the actual state
// change (docs/15 §14: the API never sets a running job to cancelled
// directly). Cancellable jobs that already finished return a conflict.
func (s *Service) RequestCancel(ctx context.Context, userID *int64, publicID uuid.UUID) error {
	j, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return err
	}
	if !j.Cancelable {
		return apperr.Conflict(apperr.CodeJobNotCancelable, "job is not cancelable")
	}
	if j.Status == StatusSucceeded || j.Status == StatusFailed || j.Status == StatusCancelled {
		return apperr.Conflict(apperr.CodeConflict, "job already finished")
	}
	return s.repo.RequestCancel(ctx, j.ID, s.now())
}