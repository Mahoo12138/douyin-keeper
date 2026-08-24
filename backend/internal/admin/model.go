// Package admin owns operational queries and controlled actions exposed to administrators.
package admin

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrUnknownAdapter = errors.New("admin: unknown adapter")
var ErrInvalidAccount = errors.New("admin: invalid account")
var ErrInvalidSetting = errors.New("admin: invalid setting")

const maxSettingValueBytes = 16 * 1024

var settingKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_.-]{0,63}$`)

var sensitiveSettingFragments = []string{"password", "secret", "token", "cookie", "session", "credential", "private_key"}

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
	ID                   int64
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

type UserListFilter struct {
	Limit          int
	AfterCreatedAt *time.Time
	AfterID        int64
}

type UserListPage struct {
	Items         []UserSummary
	NextCreatedAt *time.Time
	NextAfterID   int64
}

// JobSummary is the redacted operational projection of a generic Job. Event
// payloads are intentionally excluded; they may contain platform details or
// user-provided data and remain available only through the owner-scoped Job
// event API.
type JobSummary struct {
	ID                int64
	PublicID          uuid.UUID
	UserPublicID      *uuid.UUID
	AccountPublicID   *uuid.UUID
	Type              string
	Status            string
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

type JobListFilter struct {
	Status         string
	Type           string
	Limit          int
	AfterCreatedAt *time.Time
	AfterID        int64
}

type JobListPage struct {
	Items         []JobSummary
	NextCreatedAt *time.Time
	NextAfterID   int64
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
	ID                 int64
	PublicID           uuid.UUID
	CreatedAt          time.Time
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

type AccountListFilter struct {
	Limit          int
	AfterCreatedAt *time.Time
	AfterID        int64
}

type AccountListPage struct {
	Items         []AccountSummary
	NextCreatedAt *time.Time
	NextAfterID   int64
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
	Category       string
	Severity       string
	Code           string
	Limit          int
	AfterCreatedAt *time.Time
	AfterID        int64
}

type RiskSummary struct {
	ID               int64
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

type RiskListPage struct {
	Items         []RiskSummary
	NextCreatedAt *time.Time
	NextAfterID   int64
}

type AuditFilter struct {
	Action         string
	ResourceType   string
	Actor          string
	Limit          int
	AfterCreatedAt *time.Time
	AfterID        int64
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

type AuditListPage struct {
	Items         []AuditSummary
	NextCreatedAt *time.Time
	NextAfterID   int64
}

type Setting struct {
	Key       string
	Value     json.RawMessage
	UpdatedAt time.Time
}

type Repository interface {
	ListUserSummaries(ctx context.Context, limit int) ([]UserSummary, error)
	ListJobSummaries(ctx context.Context, filter JobListFilter) ([]JobSummary, error)
	ListAccountSummaries(ctx context.Context, limit int) ([]AccountSummary, error)
	GetRuntimeSummary(ctx context.Context) (RuntimeSummary, error)
	GetOverviewSummary(ctx context.Context) (OverviewSummary, error)
	ListAdapterHealth(ctx context.Context) ([]AdapterHealthSummary, error)
	SetAdapterEnabled(ctx context.Context, actorID int64, adapter string, enabled bool) (AdapterHealthSummary, error)
	SetAccountPaused(ctx context.Context, actorID int64, accountID uuid.UUID, paused bool) (AccountSummary, error)
	ListRiskSummaries(ctx context.Context, filter RiskFilter) ([]RiskSummary, error)
	ListAuditSummaries(ctx context.Context, filter AuditFilter) ([]AuditSummary, error)
	ListSettings(ctx context.Context) ([]Setting, error)
	SetSetting(ctx context.Context, actorID int64, key string, value json.RawMessage) (Setting, error)
}

type UserPageRepository interface {
	ListUserSummariesPage(ctx context.Context, filter UserListFilter) ([]UserSummary, error)
}

type JobPageRepository interface {
	ListJobSummariesPage(ctx context.Context, filter JobListFilter) ([]JobSummary, error)
}

type AccountPageRepository interface {
	ListAccountSummariesPage(ctx context.Context, filter AccountListFilter) ([]AccountSummary, error)
}

type RiskPageRepository interface {
	ListRiskSummariesPage(ctx context.Context, filter RiskFilter) ([]RiskSummary, error)
}

type AuditPageRepository interface {
	ListAuditSummariesPage(ctx context.Context, filter AuditFilter) ([]AuditSummary, error)
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

func (s *Service) ListJobsPage(ctx context.Context, filter JobListFilter) (JobListPage, error) {
	filter.Limit = normalizeLimit(filter.Limit)
	if filter.AfterID < 0 {
		filter.AfterID = 0
	}
	if repo, ok := s.repo.(JobPageRepository); ok {
		items, err := repo.ListJobSummariesPage(ctx, filter)
		if err != nil {
			return JobListPage{}, err
		}
		return trimJobListPage(items, filter.Limit), nil
	}
	fallbackFilter := filter
	fallbackFilter.Limit++
	items, err := s.repo.ListJobSummaries(ctx, fallbackFilter)
	if err != nil {
		return JobListPage{}, err
	}
	if filter.AfterCreatedAt != nil && filter.AfterID > 0 {
		start := len(items)
		for index, item := range items {
			if item.CreatedAt.Before(*filter.AfterCreatedAt) ||
				(item.CreatedAt.Equal(*filter.AfterCreatedAt) && item.ID < filter.AfterID) {
				start = index
				break
			}
		}
		if start < len(items) {
			items = items[start:]
		} else {
			items = nil
		}
	}
	return trimJobListPage(items, filter.Limit), nil
}

func trimJobListPage(items []JobSummary, limit int) JobListPage {
	page := JobListPage{Items: items}
	if len(items) <= limit {
		return page
	}
	page.Items = items[:limit]
	last := page.Items[len(page.Items)-1]
	if last.ID > 0 && !last.CreatedAt.IsZero() {
		createdAt := last.CreatedAt
		page.NextCreatedAt = &createdAt
		page.NextAfterID = last.ID
	}
	return page
}

func (s *Service) ListUsersPage(ctx context.Context, filter UserListFilter) (UserListPage, error) {
	filter.Limit = normalizeLimit(filter.Limit)
	if filter.AfterID < 0 {
		filter.AfterID = 0
	}
	if repo, ok := s.repo.(UserPageRepository); ok {
		items, err := repo.ListUserSummariesPage(ctx, filter)
		if err != nil {
			return UserListPage{}, err
		}
		return trimUserListPage(items, filter.Limit), nil
	}
	items, err := s.repo.ListUserSummaries(ctx, filter.Limit)
	if err != nil {
		return UserListPage{}, err
	}
	if filter.AfterCreatedAt != nil && filter.AfterID > 0 {
		start := len(items)
		for index, item := range items {
			if item.CreatedAt.Before(*filter.AfterCreatedAt) ||
				(item.CreatedAt.Equal(*filter.AfterCreatedAt) && item.ID < filter.AfterID) {
				start = index
				break
			}
		}
		if start < len(items) {
			items = items[start:]
		} else {
			items = nil
		}
	}
	return trimUserListPage(items, filter.Limit), nil
}

func trimUserListPage(items []UserSummary, limit int) UserListPage {
	page := UserListPage{Items: items}
	if len(items) <= limit {
		return page
	}
	page.Items = items[:limit]
	last := page.Items[len(page.Items)-1]
	if last.ID > 0 && !last.CreatedAt.IsZero() {
		createdAt := last.CreatedAt
		page.NextCreatedAt = &createdAt
		page.NextAfterID = last.ID
	}
	return page
}

func (s *Service) ListAccounts(ctx context.Context, limit int) ([]AccountSummary, error) {
	return s.repo.ListAccountSummaries(ctx, normalizeLimit(limit))
}

func (s *Service) ListAccountsPage(ctx context.Context, filter AccountListFilter) (AccountListPage, error) {
	filter.Limit = normalizeLimit(filter.Limit)
	if filter.AfterID < 0 {
		filter.AfterID = 0
	}
	if repo, ok := s.repo.(AccountPageRepository); ok {
		items, err := repo.ListAccountSummariesPage(ctx, filter)
		if err != nil {
			return AccountListPage{}, err
		}
		return trimAccountListPage(items, filter.Limit), nil
	}
	items, err := s.repo.ListAccountSummaries(ctx, filter.Limit)
	if err != nil {
		return AccountListPage{}, err
	}
	if filter.AfterCreatedAt != nil && filter.AfterID > 0 {
		start := len(items)
		for index, item := range items {
			if item.CreatedAt.Before(*filter.AfterCreatedAt) ||
				(item.CreatedAt.Equal(*filter.AfterCreatedAt) && item.ID < filter.AfterID) {
				start = index
				break
			}
		}
		if start < len(items) {
			items = items[start:]
		} else {
			items = nil
		}
	}
	return trimAccountListPage(items, filter.Limit), nil
}

func trimAccountListPage(items []AccountSummary, limit int) AccountListPage {
	page := AccountListPage{Items: items}
	if len(items) <= limit {
		return page
	}
	page.Items = items[:limit]
	last := page.Items[len(page.Items)-1]
	if last.ID > 0 && !last.CreatedAt.IsZero() {
		createdAt := last.CreatedAt
		page.NextCreatedAt = &createdAt
		page.NextAfterID = last.ID
	}
	return page
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

func (s *Service) ListRisksPage(ctx context.Context, filter RiskFilter) (RiskListPage, error) {
	filter.Limit = normalizeLimit(filter.Limit)
	if filter.AfterID < 0 {
		filter.AfterID = 0
	}
	if repo, ok := s.repo.(RiskPageRepository); ok {
		items, err := repo.ListRiskSummariesPage(ctx, filter)
		if err != nil {
			return RiskListPage{}, err
		}
		return trimRiskListPage(items, filter.Limit), nil
	}
	items, err := s.repo.ListRiskSummaries(ctx, filter)
	if err != nil {
		return RiskListPage{}, err
	}
	if filter.AfterCreatedAt != nil && filter.AfterID > 0 {
		start := len(items)
		for index, item := range items {
			if item.CreatedAt.Before(*filter.AfterCreatedAt) ||
				(item.CreatedAt.Equal(*filter.AfterCreatedAt) && item.ID < filter.AfterID) {
				start = index
				break
			}
		}
		if start < len(items) {
			items = items[start:]
		} else {
			items = nil
		}
	}
	return trimRiskListPage(items, filter.Limit), nil
}

func trimRiskListPage(items []RiskSummary, limit int) RiskListPage {
	page := RiskListPage{Items: items}
	if len(items) <= limit {
		return page
	}
	page.Items = items[:limit]
	last := page.Items[len(page.Items)-1]
	if last.ID > 0 && !last.CreatedAt.IsZero() {
		createdAt := last.CreatedAt
		page.NextCreatedAt = &createdAt
		page.NextAfterID = last.ID
	}
	return page
}

func (s *Service) ListAuditLogs(ctx context.Context, filter AuditFilter) ([]AuditSummary, error) {
	filter.Limit = normalizeLimit(filter.Limit)
	return s.repo.ListAuditSummaries(ctx, filter)
}

func (s *Service) ListAuditLogsPage(ctx context.Context, filter AuditFilter) (AuditListPage, error) {
	filter.Limit = normalizeLimit(filter.Limit)
	if filter.AfterID < 0 {
		filter.AfterID = 0
	}
	if repo, ok := s.repo.(AuditPageRepository); ok {
		items, err := repo.ListAuditSummariesPage(ctx, filter)
		if err != nil {
			return AuditListPage{}, err
		}
		return trimAuditListPage(items, filter.Limit), nil
	}
	items, err := s.repo.ListAuditSummaries(ctx, filter)
	if err != nil {
		return AuditListPage{}, err
	}
	if filter.AfterCreatedAt != nil && filter.AfterID > 0 {
		start := len(items)
		for index, item := range items {
			if item.CreatedAt.Before(*filter.AfterCreatedAt) ||
				(item.CreatedAt.Equal(*filter.AfterCreatedAt) && item.ID < filter.AfterID) {
				start = index
				break
			}
		}
		if start < len(items) {
			items = items[start:]
		} else {
			items = nil
		}
	}
	return trimAuditListPage(items, filter.Limit), nil
}

func trimAuditListPage(items []AuditSummary, limit int) AuditListPage {
	page := AuditListPage{Items: items}
	if len(items) <= limit {
		return page
	}
	page.Items = items[:limit]
	last := page.Items[len(page.Items)-1]
	if last.ID > 0 && !last.CreatedAt.IsZero() {
		createdAt := last.CreatedAt
		page.NextCreatedAt = &createdAt
		page.NextAfterID = last.ID
	}
	return page
}

func (s *Service) ListSettings(ctx context.Context) ([]Setting, error) {
	return s.repo.ListSettings(ctx)
}

func (s *Service) SetSetting(ctx context.Context, actorID int64, key string, value json.RawMessage) (Setting, error) {
	key = strings.TrimSpace(key)
	if actorID <= 0 || !settingKeyPattern.MatchString(key) || containsSensitiveSettingFragment(key) {
		return Setting{}, ErrInvalidSetting
	}
	if len(value) == 0 || len(value) > maxSettingValueBytes || !json.Valid(value) {
		return Setting{}, ErrInvalidSetting
	}
	compact := make([]byte, 0, len(value))
	compact, err := json.Marshal(json.RawMessage(value))
	if err != nil {
		return Setting{}, ErrInvalidSetting
	}
	return s.repo.SetSetting(ctx, actorID, key, compact)
}

func containsSensitiveSettingFragment(key string) bool {
	lower := strings.ToLower(key)
	for _, fragment := range sensitiveSettingFragments {
		if strings.Contains(lower, fragment) {
			return true
		}
	}
	return false
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
