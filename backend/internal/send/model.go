// Package send owns the SendIntent / SendJob state machines (docs/15 §4–§7).
// Scheduling and dispatch both dedupe; success requires verifiable platform
// evidence — this package never invents "success".
package send

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type IntentType string

const (
	IntentScheduled IntentType = "scheduled"
	IntentManual    IntentType = "manual"
)

type IntentStatus string

const MaxSendAttempts = 4

const (
	IntentPending   IntentStatus = "pending"
	IntentQueued    IntentStatus = "queued"
	IntentRunning   IntentStatus = "running"
	IntentRetryWait IntentStatus = "retry_wait"
	IntentSucceeded IntentStatus = "succeeded"
	IntentFailed    IntentStatus = "failed"
	IntentSkipped   IntentStatus = "skipped"
	IntentCancelled IntentStatus = "cancelled"
)

func (s IntentStatus) Terminal() bool {
	return s == IntentSucceeded || s == IntentFailed || s == IntentSkipped || s == IntentCancelled
}

type JobStatus string

const (
	JobQueued    JobStatus = "queued"
	JobRunning   JobStatus = "running"
	JobSucceeded JobStatus = "succeeded"
	JobFailed    JobStatus = "failed"
	JobCancelled JobStatus = "cancelled"
)

type SendIntent struct {
	ID            int64
	PublicID      uuid.UUID
	IntentType    IntentType
	RequestID     *uuid.UUID
	TaskID        *int64
	TaskPublicID  *uuid.UUID
	AccountID     int64
	FriendID      int64
	LocalDate     *string
	ScheduledAt   time.Time
	Status        IntentStatus
	ErrorCode     *string
	NextAttemptAt *time.Time
	LastJobID     *int64
	CreatedAt     time.Time
	UpdatedAt     time.Time

	// MessageKind and MessageBody are immutable snapshots captured when the
	// intent is created. TaskMessage* remain the joined task projection used by
	// older callers and as a fallback for intents created before this snapshot
	// was introduced.
	MessageKind *string
	MessageBody *string

	// Joined for API responses (repo fills them).
	AccountPublicID   uuid.UUID
	AccountNickname   string
	FriendPublicID    uuid.UUID
	FriendDisplayName string
	TaskMessageKind   *string
	TaskMessageBody   *string
	LatestJob         *SendJob
}

type IntentListFilter struct {
	AccountID *uuid.UUID
	FriendID  *uuid.UUID
	Status    string
	From      *time.Time
	To        *time.Time
	Limit     int
	AfterID   int64
}

type IntentListPage struct {
	Items       []*SendIntent
	NextAfterID int64
}

type SendJob struct {
	ID                int64
	PublicID          uuid.UUID
	IntentID          int64
	AccountID         int64
	FriendID          int64
	Attempt           int
	SelectedAdapter   *string
	Status            JobStatus
	ErrorCode         *string
	Retryable         bool
	PlatformMessageID *string
	WorkerID          *string
	HeartbeatAt       *time.Time
	LeaseExpiresAt    *time.Time
	StartedAt         *time.Time
	FinishedAt        *time.Time
	CreatedAt         time.Time

	AccountPublicID uuid.UUID
}

// ExpiredSendJob is a locked, running attempt whose lease expired before the
// worker persisted an outcome. It is intentionally a separate read model so a
// reaper can fail closed without ever treating it as retryable.
type ExpiredSendJob struct {
	Job    *SendJob
	Intent *SendIntent
	UserID int64
}

type RetryDueIntent struct {
	Intent *SendIntent
	UserID int64
}

type Repository interface {
	CreateIntent(ctx context.Context, in *SendIntent) error
	CreateScheduledIntent(ctx context.Context, in *SendIntent) (bool, error)
	GetIntentByID(ctx context.Context, intentID int64) (*SendIntent, error)
	GetIntentByPublicID(ctx context.Context, publicID uuid.UUID) (*SendIntent, error)
	GetIntentOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*SendIntent, error)
	ListIntentsByUser(ctx context.Context, userID int64, filter IntentListFilter) ([]*SendIntent, error)
	CreateJob(ctx context.Context, j *SendJob) error
	GetJobByPublicID(ctx context.Context, publicID uuid.UUID) (*SendJob, error)
	GetJobOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*SendJob, error)
	ClaimJob(ctx context.Context, publicID uuid.UUID, workerID string, lease time.Duration) (*SendJob, error)
	CancelQueuedJob(ctx context.Context, jobID int64, errorCode *string, at time.Time) (bool, error)
	HeartbeatJob(ctx context.Context, jobID int64, workerID string, lease time.Duration) error
	FindExpiredJobs(ctx context.Context, at time.Time, limit int) ([]ExpiredSendJob, error)
	FindRetryDue(ctx context.Context, at time.Time, limit int) ([]RetryDueIntent, error)
	FinishJob(ctx context.Context, jobID int64, status JobStatus, errorCode *string, retryable bool, platformMessageID *string, at time.Time) error
	SetIntentStatus(ctx context.Context, intentID int64, status IntentStatus, errorCode *string, nextAttemptAt *time.Time, at time.Time) error
	SetIntentLastJob(ctx context.Context, intentID, jobID int64) error
	CountJobsForIntent(ctx context.Context, intentID int64) (int, error)
}

// PageRepository is the API-facing cursor projection. The legacy list method
// remains available for internal callers that need the bounded snapshot query.
type PageRepository interface {
	ListIntentsByUserPage(ctx context.Context, userID int64, filter IntentListFilter) ([]*SendIntent, error)
}
