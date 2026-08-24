// Package notification owns user-facing in-app notifications.
package notification

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

var ErrInvalidUser = errors.New("notification: invalid user")

type Priority string

const (
	PriorityInfo     Priority = "info"
	PriorityWarning  Priority = "warning"
	PriorityCritical Priority = "critical"
)

type Type string

const (
	TypeRiskEvent Type = "risk_event"
)

type Notification struct {
	ID           int64
	PublicID     uuid.UUID
	UserID       int64
	Type         Type
	Priority     Priority
	Title        string
	Body         string
	ResourceType *string
	ResourceID   *string
	DedupeKey    string
	ReadAt       *time.Time
	CreatedAt    time.Time
	ExpiresAt    *time.Time
}

type ListFilter struct {
	UnreadOnly bool
	Limit      int
}

type Repository interface {
	List(ctx context.Context, userID int64, filter ListFilter) ([]*Notification, int, error)
	MarkRead(ctx context.Context, userID int64, publicID uuid.UUID) (bool, error)
	MarkAllRead(ctx context.Context, userID int64) (int, error)
	Create(ctx context.Context, item *Notification) error
}
