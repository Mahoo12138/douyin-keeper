// Package admin owns operational queries and controlled actions exposed to administrators.
package admin

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

var ErrUnknownAdapter = errors.New("admin: unknown adapter")
var ErrInvalidAccount = errors.New("admin: invalid account")

var KnownAdapters = []string{
	"browser.consumer",
	"browser.creator",
	"protocol.im",
}

func IsKnownAdapter(name string) bool {
	for _, adapter := range KnownAdapters {
		if adapter == name {
			return true
		}
	}
	return false
}

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

type FailureCodeSummary struct {
	Code  string
	Count int
}

type AdapterSuccessSummary struct {
	Name      string
	Succeeded int
	Failed    int
}

type OverviewSummary struct {
	ObservedAt          time.Time
	ActiveUsers         int
	DAU                 int
	ActiveAccounts      int
	TodaySendSucceeded  int
	TodaySendFailed     int
	RiskAccounts        int
	QueuePending        int
	QueueActive         int
	QueueRetry          int
	QueueLatencySeconds int
	WorkersOnline       int
	WorkersTotal        int
	FailureCodes        []FailureCodeSummary
	AdapterSuccesses    []AdapterSuccessSummary
}

type AdapterHealthSummary struct {
	Name             string
	Status           string
	Enabled          bool
	Executable       bool
	Version          *string
	ErrorCode        *string
	FailureCount     int
	CircuitOpenUntil *time.Time
	CheckedAt        *time.Time
}

type RiskFilter struct {
	Category string
	Severity string
	Code     string
	Limit    int
}

type RiskSummary struct {
	PublicID         uuid.UUID
	AccountPublicID  uuid.UUID
	OwnerDisplayName string
	Nickname         string
	Category         string
	Code             string
	Severity         string
	SourceAdapter    *string
	Action           *string
	CooldownUntil    *time.Time
	CreatedAt        time.Time
}

type AuditFilter struct {
	Action       string
	ResourceType string
	Actor        string
	Limit        int
}

type AuditSummary struct {
	ID               int64
	ActorDisplayName *string
	Action           string
	ResourceType     string
	ResourceID       *string
	HasDetail        bool
	CreatedAt        time.Time
}

type Repository interface {
	ListUserSummaries(ctx context.Context, limit int) ([]UserSummary, error)
	ListAccountSummaries(ctx context.Context, limit int) ([]AccountSummary, error)
	GetRuntimeSummary(ctx context.Context) (RuntimeSummary, error)
	GetOverviewSummary(ctx context.Context) (OverviewSummary, error)
	ListAdapterHealth(ctx context.Context) ([]AdapterHealthSummary, error)
	SetAdapterEnabled(ctx context.Context, actorID int64, adapter string, enabled bool) (AdapterHealthSummary, error)
	SetAccountPaused(ctx context.Context, actorID int64, accountID uuid.UUID, paused bool) (AccountSummary, error)
	ListRiskSummaries(ctx context.Context, filter RiskFilter) ([]RiskSummary, error)
	ListAuditSummaries(ctx context.Context, filter AuditFilter) ([]AuditSummary, error)
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

func (s *Service) Overview(ctx context.Context) (OverviewSummary, error) {
	return s.repo.GetOverviewSummary(ctx)
}

func (s *Service) ListAdapters(ctx context.Context) ([]AdapterHealthSummary, error) {
	return s.repo.ListAdapterHealth(ctx)
}

func (s *Service) SetAdapterEnabled(ctx context.Context, actorID int64, adapter string, enabled bool) (AdapterHealthSummary, error) {
	if !IsKnownAdapter(adapter) {
		return AdapterHealthSummary{}, ErrUnknownAdapter
	}
	return s.repo.SetAdapterEnabled(ctx, actorID, adapter, enabled)
}

func (s *Service) SetAccountPaused(ctx context.Context, actorID int64, accountID uuid.UUID, paused bool) (AccountSummary, error) {
	if actorID <= 0 || accountID == uuid.Nil {
		return AccountSummary{}, ErrInvalidAccount
	}
	return s.repo.SetAccountPaused(ctx, actorID, accountID, paused)
}

func (s *Service) ListRisks(ctx context.Context, filter RiskFilter) ([]RiskSummary, error) {
	filter.Limit = normalizeLimit(filter.Limit)
	return s.repo.ListRiskSummaries(ctx, filter)
}

func (s *Service) ListAuditLogs(ctx context.Context, filter AuditFilter) ([]AuditSummary, error) {
	filter.Limit = normalizeLimit(filter.Limit)
	return s.repo.ListAuditSummaries(ctx, filter)
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
