// Package capability owns account capability snapshots and the resolver policy
// (docs/05 §8, docs/04 §6).
package capability

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

const (
	NameLoginQR             = "login.qr"
	NameSessionValidate     = "session.validate"
	NameFriendsSync         = "friends.sync"
	NameMessageTextExisting = "message.send.text.existing"
)

const (
	AdapterBrowserConsumer = "browser.consumer"
)

const (
	AdapterStatusHealthy  = "healthy"
	AdapterStatusDegraded = "degraded"
	AdapterStatusOpen     = "open"
	AdapterStatusDisabled = "disabled"
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

type ProbeTarget struct {
	AccountID int64
	PublicID  uuid.UUID
}

// ProbeRepository supplies bound accounts whose capability snapshot needs a
// refresh. It is kept separate from Repository so read-only API consumers do
// not depend on scheduler-specific queries.
type ProbeRepository interface {
	ListStaleProbeTargets(ctx context.Context, before time.Time, limit int) ([]ProbeTarget, error)
}

type AdapterHealth struct {
	Adapter          string
	Status           string
	Version          *string
	ErrorCode        *string
	FailureCount     int
	CircuitOpenUntil *time.Time
	CheckedAt        time.Time
}

type HealthRepository interface {
	GetAdapterHealth(ctx context.Context, adapter string) (*AdapterHealth, error)
	RecordAdapterSuccess(ctx context.Context, adapter, version string, checkedAt time.Time) error
	RecordAdapterFailure(ctx context.Context, adapter, version, errorCode string, threshold int, openUntil, checkedAt time.Time) error
}

type HealthObserver interface {
	Allow(ctx context.Context, adapter string) (bool, error)
	ObserveSuccess(ctx context.Context, adapter, version string, checkedAt time.Time) error
	ObserveFailure(ctx context.Context, adapter, version, errorCode string, checkedAt time.Time) error
}

type HealthPolicy struct {
	FailureThreshold int
	OpenFor          time.Duration
}

func DefaultHealthPolicy() HealthPolicy {
	return HealthPolicy{FailureThreshold: 3, OpenFor: 10 * time.Minute}
}

type HealthService struct {
	store  HealthRepository
	policy HealthPolicy
	now    func() time.Time
}

func NewHealthService(store HealthRepository, policy HealthPolicy) *HealthService {
	if policy.FailureThreshold <= 0 {
		policy.FailureThreshold = 3
	}
	if policy.OpenFor <= 0 {
		policy.OpenFor = 10 * time.Minute
	}
	return &HealthService{store: store, policy: policy, now: time.Now}
}

func (s *HealthService) SetNow(now func() time.Time) { s.now = now }

func (s *HealthService) Allow(ctx context.Context, adapter string) (bool, error) {
	if s == nil || s.store == nil {
		return false, fmt.Errorf("capability health: repository is not configured")
	}
	health, err := s.store.GetAdapterHealth(ctx, adapter)
	if err != nil {
		return false, err
	}
	if health == nil {
		// Account capability snapshots remain the primary per-account gate. A
		// missing global row must not turn a healthy, newly deployed adapter
		// into a permanent outage before its first probe.
		return true, nil
	}
	if health.Status == AdapterStatusDisabled {
		return false, nil
	}
	now := time.Now()
	if s.now != nil {
		now = s.now()
	}
	if health.Status == AdapterStatusOpen {
		if health.CircuitOpenUntil == nil || now.Before(*health.CircuitOpenUntil) {
			return false, nil
		}
	}
	return true, nil
}

func (s *HealthService) ObserveSuccess(ctx context.Context, adapter, version string, checkedAt time.Time) error {
	if s == nil || s.store == nil {
		return fmt.Errorf("capability health: repository is not configured")
	}
	return s.store.RecordAdapterSuccess(ctx, adapter, version, checkedAt)
}

func (s *HealthService) ObserveFailure(ctx context.Context, adapter, version, errorCode string, checkedAt time.Time) error {
	if s == nil || s.store == nil {
		return fmt.Errorf("capability health: repository is not configured")
	}
	openUntil := checkedAt.Add(s.policy.OpenFor)
	return s.store.RecordAdapterFailure(ctx, adapter, version, errorCode,
		s.policy.FailureThreshold, openUntil, checkedAt)
}

func IsCircuitFailureCode(code string) bool {
	switch code {
	case "ADAPTER_INCOMPATIBLE", "BROWSER_SELECTOR_CHANGED", "UNSUPPORTED_PROTOCOL_VERSION":
		return true
	default:
		return false
	}
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
