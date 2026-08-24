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
	TypeRiskEvent         Type = "risk_event"
	TypeEntitlementExpiry Type = "entitlement_expiry"
)

type DeliveryStatus string

const (
	DeliveryPending DeliveryStatus = "pending"
	DeliverySent    DeliveryStatus = "sent"
	DeliverySkipped DeliveryStatus = "skipped"
	DeliveryFailed  DeliveryStatus = "failed"
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

type Preferences struct {
	UserID        int64
	WechatEnabled bool
	UpdatedAt     time.Time
}

// WechatDelivery is the worker-safe projection of an in-app notification and
// its current WeChat delivery state. It never contains session_key or other
// WeChat credentials.
type WechatDelivery struct {
	ID                   int64
	NotificationID       int64
	NotificationPublicID uuid.UUID
	UserID               int64
	Title                string
	Body                 string
	CreatedAt            time.Time
	OpenID               string
	WechatEnabled        bool
	Status               DeliveryStatus
	Attempts             int
	LastErrorCode        *string
}

type Repository interface {
	List(ctx context.Context, userID int64, filter ListFilter) ([]*Notification, int, error)
	MarkRead(ctx context.Context, userID int64, publicID uuid.UUID) (bool, error)
	MarkAllRead(ctx context.Context, userID int64) (int, error)
	Create(ctx context.Context, item *Notification) error
	GetPreferences(ctx context.Context, userID int64) (*Preferences, error)
	SetWechatEnabled(ctx context.Context, userID int64, enabled bool, at time.Time) (*Preferences, error)
}

type DeliveryRepository interface {
	EnsureWechatDelivery(ctx context.Context, publicID uuid.UUID) error
	GetWechatDelivery(ctx context.Context, publicID uuid.UUID) (*WechatDelivery, error)
	MarkWechatDeliverySent(ctx context.Context, publicID uuid.UUID, at time.Time) error
	MarkWechatDeliverySkipped(ctx context.Context, publicID uuid.UUID, reason string, at time.Time) error
	MarkWechatDeliveryFailed(ctx context.Context, publicID uuid.UUID, code string, at time.Time) error
}
