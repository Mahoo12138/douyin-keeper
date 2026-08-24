// Package capability owns account capability snapshots and the resolver policy
// (docs/05 §8, docs/04 §6).
package capability

import (
	"context"
	"time"
)

const (
	NameLoginQR             = "login.qr"
	NameSessionValidate     = "session.validate"
	NameFriendsSync         = "friends.sync"
	NameMessageTextExisting = "message.send.text.existing"
)

const (
	StatusAvailable   = "available"
	StatusDegraded    = "degraded"
	StatusUnavailable = "unavailable"
	StatusUnknown     = "unknown"
)

var KnownNames = []string{NameLoginQR, NameSessionValidate, NameFriendsSync, NameMessageTextExisting}

type Capability struct {
	AccountID int64
	Name      string // session.validate | friends.sync | message.send.text.existing | ...
	Status    string // available | degraded | unavailable | unknown
	Adapter   *string
	ErrorCode *string
	CheckedAt time.Time
}

type Repository interface {
	ListByAccount(ctx context.Context, accountID int64) ([]Capability, error)
	GetByAccountAndName(ctx context.Context, accountID int64, name string) (*Capability, error)
	Upsert(ctx context.Context, c Capability) error
}

type HealthSnapshot struct {
	Status       string
	Adapter      string
	Version      string
	Capabilities []string
}

// FromHealth converts the adapter-neutral health result into account-scoped
// snapshots. A missing capability is explicitly unavailable, not silently
// treated as healthy.
func FromHealth(accountID int64, health HealthSnapshot, checkedAt time.Time) []Capability {
	available := make(map[string]bool, len(health.Capabilities))
	for _, name := range health.Capabilities {
		available[name] = true
	}
	status := StatusAvailable
	if health.Status != "healthy" {
		status = StatusDegraded
	}
	adapter := health.Adapter
	result := make([]Capability, 0, len(KnownNames))
	for _, name := range KnownNames {
		itemStatus := status
		if !available[name] {
			itemStatus = StatusUnavailable
		}
		var adapterPtr *string
		if adapter != "" {
			adapterPtr = &adapter
		}
		result = append(result, Capability{AccountID: accountID, Name: name, Status: itemStatus,
			Adapter: adapterPtr, CheckedAt: checkedAt})
	}
	return result
}
