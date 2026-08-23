// Package capability owns account capability snapshots and the resolver policy
// (docs/05 §8, docs/04 §6).
package capability

import (
	"context"
	"time"
)

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
}