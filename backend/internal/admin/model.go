// Package admin owns read-only operational queries exposed to administrators.
package admin

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type UserSummary struct {
	PublicID             uuid.UUID
	DisplayName          string
	Role                 string
	Status               string
	CreatedAt            time.Time
	LastLoginAt          *time.Time
	AccountCount         int
	TaskCount            int
	EntitlementExpiresAt *time.Time
}

type AccountCapability struct {
	Name      string
	Status    string
	Adapter   *string
	ErrorCode *string
	CheckedAt time.Time
}

type RecentError struct {
	Category      string
	Code          string
	Severity      string
	SourceAdapter *string
	CreatedAt     time.Time
}

type AccountSummary struct {
	PublicID           uuid.UUID
	OwnerPublicID      uuid.UUID
	OwnerDisplayName   string
	PlatformUserID     *string
	Nickname           string
	BindingStatus      string
	SessionStatus      string
	RiskStatus         string
	PausedAt           *time.Time
	CooldownUntil      *time.Time
	LastSessionCheckAt *time.Time
	LastFriendSyncAt   *time.Time
	Capabilities       []AccountCapability
	TodaySendSucceeded int
	TodaySendFailed    int
	LatestError        *RecentError
}

type WorkerPoolSummary struct {
	Name              string
	Online            bool
	StartedAt         *time.Time
	LastObservedAt    *time.Time
	ActiveWorkers     int
	Concurrency       int
	Version           *string
	PlaywrightVersion *string
	ProtocolVersion   *string
}

type QueueSummary struct {
	Name           string
	Pool           string
	Pending        int
	Active         int
	Scheduled      int
	Retry          int
	Failed         int
	Processed      int
	LatencySeconds int
	Paused         bool
}

type RuntimeSummary struct {
	ObservedAt             time.Time
	APIVersion             *string
	WorkerVersion          *string
	PlaywrightSidecar      *string
	ProtocolSidecar        *string
	Pools                  []WorkerPoolSummary
	Queues                 []QueueSummary
	RunningJobs            int
	FailedJobs24h          int
	BrowserSlotsUsed       int
	BrowserSlotsLimit      int
	SchedulerOnline        bool
	SchedulerLeaderExpires *time.Time
}

type Repository interface {
	ListUserSummaries(ctx context.Context, limit int) ([]UserSummary, error)
	ListAccountSummaries(ctx context.Context, limit int) ([]AccountSummary, error)
	GetRuntimeSummary(ctx context.Context) (RuntimeSummary, error)
}

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) ListUsers(ctx context.Context, limit int) ([]UserSummary, error) {
	return s.repo.ListUserSummaries(ctx, normalizeLimit(limit))
}

func (s *Service) ListAccounts(ctx context.Context, limit int) ([]AccountSummary, error) {
	return s.repo.ListAccountSummaries(ctx, normalizeLimit(limit))
}

func (s *Service) Runtime(ctx context.Context) (RuntimeSummary, error) {
	return s.repo.GetRuntimeSummary(ctx)
}

func normalizeLimit(limit int) int {
	if limit <= 0 {
		return 50
	}
	if limit > 100 {
		return 100
	}
	return limit
}
