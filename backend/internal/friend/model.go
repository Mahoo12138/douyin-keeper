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
	ID               int64
	PublicID         uuid.UUID
	AccountID        int64
	PlatformUserID   *string
	IdentityStatus   IdentityStatus
	DisplayName      string
	Nickname         string
	ShortID          *string
	AvatarURL        *string
	StreakDays       int
	HasConversation  bool
	SparkEnabled     bool
	LastSeenAt       *time.Time
	LastSentAt       *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
	DeletedAt        *time.Time
}

// Resolved reports whether automated sending is allowed (docs/09 §5).
func (f *Friend) Resolved() bool { return f.IdentityStatus == IdentityResolved }

type Repository interface {
	// ListByAccountOwned joins through douyin_accounts for user scoping.
	ListByAccountOwned(ctx context.Context, userID int64, accountPublicID uuid.UUID) ([]*Friend, error)
	GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*Friend, error)
	UpdateSparkEnabled(ctx context.Context, friendID int64, enabled bool) error
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
	if err := s.repo.UpdateSparkEnabled(ctx, f.ID, enabled); err != nil {
		return nil, err
	}
	f.SparkEnabled = enabled
	return f, nil
}