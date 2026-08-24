// Package job owns the generic long-running job (QR binding, session check,
// friend sync) and its SSE event log (docs/06 §7, docs/15 §13). SendIntent /
// SendJob have their own domain state and must not be modeled as jobs.
package job

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusQueued    Status = "queued"
	StatusRunning   Status = "running"
	StatusWaiting   Status = "waiting_user"
	StatusSucceeded Status = "succeeded"
	StatusFailed    Status = "failed"
	StatusCancelled Status = "cancelled"
)

// Job is one row in jobs.
type Job struct {
	ID                int64
	PublicID          uuid.UUID
	UserID            *int64
	AccountID         *int64
	Type              string // account.bind.qr | account.session_check.browser | ...
	Status            Status
	ErrorCode         *string
	Cancelable        bool
	CancelRequestedAt *time.Time
	WorkerID          *string
	HeartbeatAt       *time.Time
	LeaseExpiresAt    *time.Time
	CreatedAt         time.Time
	StartedAt         *time.Time
	FinishedAt        *time.Time
}

// JobEvent is one row in job_events (append-only, replayed over SSE).
type JobEvent struct {
	Seq       int64
	EventType string // started | qr_ready | scanned | confirming | challenge_required | success | error | cancelled
	Payload   json.RawMessage
	CreatedAt time.Time
}

const SMSVerificationTTL = 2 * time.Minute

func SMSVerificationKey(publicID uuid.UUID) string {
	return "job:sms-verification:" + publicID.String()
}

// Repository is implemented by infra/postgres.
type Repository interface {
	CreateJob(ctx context.Context, j *Job) error
	// GetOwned resolves by public id with user scope.
	GetOwned(ctx context.Context, userID *int64, publicID uuid.UUID) (*Job, error)
	// Claim performs the worker-side queued -> running CAS. A nil result means
	// another delivery already claimed or completed the job.
	Claim(ctx context.Context, publicID uuid.UUID, workerID string, lease time.Duration) (*Job, error)
	Heartbeat(ctx context.Context, jobID int64, workerID string, lease time.Duration) error
	MarkWaiting(ctx context.Context, jobID int64, lease time.Duration) error
	Finish(ctx context.Context, jobID int64, status Status, errorCode *string, at time.Time) error
	IsCancelRequested(ctx context.Context, jobID int64) (bool, error)
	ListEvents(ctx context.Context, jobID int64) ([]JobEvent, error)
	AppendEvent(ctx context.Context, jobID int64, event JobEvent) error
	RequestCancel(ctx context.Context, jobID int64, at time.Time) error
}

// TxManager is the transaction slice used by services.
type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
