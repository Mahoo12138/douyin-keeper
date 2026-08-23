// Package outbox defines the transactional-outbox contract (docs/15 §2).
// Business transactions write a Message inside their own DB tx; an external
// Publisher relays it to Asynq after commit. Redis is never a source of truth.
package outbox

import (
	"context"
	"encoding/json"
	"time"
)

// Message is one queue_outbox row.
type Message struct {
	// ID is a client-generated public id (uuid) or empty for auto.
	ID string
	// Kind selects the asynq task type / worker queue.
	Kind string
	AggregateType string
	AggregateID   string
	Payload       json.RawMessage
	AvailableAt   time.Time
	// DedupeKey must be unique; duplicates are absorbed (UNIQUE constraint).
	DedupeKey string
}

// Outbox is implemented by infra/postgres.OutboxRepo. Add MUST be called
// inside the business transaction (TxManager.WithinTx) so the message commits
// atomically with its domain row.
type Outbox interface {
	Add(ctx context.Context, msg Message) error
}

// Kind constants mirror asynqqueue kinds.
const (
	KindAccountBindQR       = "account.bind.qr"
	KindAccountBindSMS      = "account.bind.sms"
	KindSessionCheckBrowser = "account.session_check.browser"
	KindFriendsSyncBrowser  = "account.friends_sync.browser"
	KindSendDispatch        = "send.dispatch"
	KindSendBrowser         = "send.browser"
	KindSendProtocol        = "send.protocol"
	KindCapabilityProbe     = "capability.probe"
)