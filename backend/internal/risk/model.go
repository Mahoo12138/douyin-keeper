// Package risk owns risk event recording and the cooldown/pause policy
// (docs/07 §4). Workers classify every platform failure into one stable
// category.
package risk

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type Category string

const (
	CategoryAuth     Category = "AUTH"
	CategoryPlatform Category = "PLATFORM"
	CategoryProtocol Category = "PROTOCOL"
	CategoryBrowser  Category = "BROWSER"
	CategoryNetwork  Category = "NETWORK"
	CategoryData     Category = "DATA"
)

type Severity string

const (
	SeverityInfo    Severity = "info"
	SeverityWarning Severity = "warning"
	SeverityCritical Severity = "critical"
)

type Event struct {
	ID            int64
	PublicID      uuid.UUID
	AccountID     int64
	Category      Category
	Code          string
	Severity      Severity
	SourceAdapter *string
	Detail        map[string]any
	Action        *string
	CooldownUntil *time.Time
	CreatedAt     time.Time
}

type Repository interface {
	Record(ctx context.Context, e *Event) error
	ListByAccount(ctx context.Context, accountID int64, limit int) ([]*Event, error)
}