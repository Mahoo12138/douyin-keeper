// Package capability owns account capability snapshots and the resolver policy
// (docs/05 §8, docs/04 §6).
package capability

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
)

const (
	NameLoginQR             = "login.qr"
	NameLoginSMS            = "login.sms"
	NameSessionValidate     = "session.validate"
	NameFriendsSync         = "friends.sync"
	NameConversationsSync   = "conversations.sync"
	NameMessageTextExisting = "message.send.text.existing"
	NameMessageTextFirst    = "message.send.text.first"
	NameMessageSticker      = "message.send.sticker.existing"
)

const (
	AdapterBrowserConsumer = "browser.consumer"
	AdapterProtocolIM      = "protocol.im"
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

var KnownNames = []string{NameLoginQR, NameLoginSMS, NameSessionValidate, NameFriendsSync, NameConversationsSync, NameMessageTextExisting,
	NameMessageTextFirst, NameMessageSticker}

type Capability struct {
	AccountID int64
	Name      string // session.validate | friends.sync | message.send.text.existing | ...
	Status    string // available | degraded | unavailable | unknown
	Adapter   *string
	ErrorCode *string
	CheckedAt time.Time
}

// ResolveRequest describes the platform message shape without exposing task
// or friend persistence to the resolver.
type ResolveRequest struct {
	MessageKind       string
	HasConversation   bool
	AllowFirstMessage bool
}

// Route is a planning result. Available is deliberately separate from
// Adapter: dispatch may persist the safest executable route even when the
// account snapshot is stale or unavailable; the worker remains the final
// capability gate before touching the platform.
type Route struct {
	Adapter    string
	Capability string
	Available  bool
	Reason     string
}

type routeCandidate struct {
	adapter    string
	capability string
}

// Resolver selects an adapter using account snapshots, global adapter health,
// and an explicit executable-adapter allowlist. Normal existing-conversation
// routes cannot select an unregistered adapter; the first-message protocol
// plan is the deliberate exception because it has no safe browser fallback.
type Resolver struct {
	snapshots  Repository
	health     HealthObserver
	executable map[string]struct{}
}

func NewResolver(snapshots Repository, health HealthObserver, executable ...string) *Resolver {
	allowed := make(map[string]struct{}, len(executable))
	for _, adapter := range executable {
		if adapter != "" {
			allowed[adapter] = struct{}{}
		}
	}
	return &Resolver{snapshots: snapshots, health: health, executable: allowed}
}

func (r *Resolver) Resolve(ctx context.Context, accountID int64, req ResolveRequest) (Route, error) {
	candidates, fallback, err := routeCandidates(req)
	if err != nil {
		return Route{}, err
	}
	if r == nil {
		return fallback, nil
	}
	if r.snapshots != nil {
		snapshots, err := r.snapshots.ListByAccount(ctx, accountID)
		if err != nil {
			return Route{}, fmt.Errorf("capability resolver: list snapshots: %w", err)
		}
		byCapability := make(map[string]map[string]Capability, len(snapshots))
		for _, snapshot := range snapshots {
			adapter := ""
			if snapshot.Adapter != nil {
				adapter = *snapshot.Adapter
			}
			if byCapability[snapshot.Name] == nil {
				byCapability[snapshot.Name] = make(map[string]Capability)
			}
			byCapability[snapshot.Name][adapter] = snapshot
		}
		for _, candidate := range candidates {
			if !r.isExecutable(candidate.adapter) {
				continue
			}
			byAdapter, ok := byCapability[candidate.capability]
			snapshot, ok := byAdapter[candidate.adapter]
			if !ok || snapshot.Status != StatusAvailable || snapshot.Adapter == nil || *snapshot.Adapter != candidate.adapter {
				continue
			}
			if r.health != nil {
				allowed, err := r.health.Allow(ctx, candidate.adapter)
				if err != nil {
					return Route{}, fmt.Errorf("capability resolver: adapter health %s: %w", candidate.adapter, err)
				}
				if !allowed {
					continue
				}
			}
			return Route{Adapter: candidate.adapter, Capability: candidate.capability, Available: true}, nil
		}
	}

	return r.resolveFallback(ctx, fallback, req)
}

func (r *Resolver) resolveFallback(ctx context.Context, fallback Route, req ResolveRequest) (Route, error) {
	if fallback.Adapter == "" {
		return fallback, nil
	}
	if !r.isExecutable(fallback.Adapter) {
		// A first-message route has no safe browser fallback. Preserve the
		// protocol plan so dispatch sends it to the protocol lane, where the
		// unavailable adapter can fail closed without touching the browser.
		if req.AllowFirstMessage && fallback.Adapter == AdapterProtocolIM {
			fallback.Reason = "no_executable_adapter"
			return fallback, nil
		}
		fallback.Adapter = ""
		fallback.Reason = "no_executable_adapter"
		return fallback, nil
	}
	if r.health != nil {
		allowed, err := r.health.Allow(ctx, fallback.Adapter)
		if err != nil {
			return Route{}, fmt.Errorf("capability resolver: fallback adapter health %s: %w", fallback.Adapter, err)
		}
		if !allowed {
			// Keep first-message work on the protocol lane even when the
			// protocol is currently open/disabled; dispatch must fail closed
			// instead of silently changing the operation to browser semantics.
			if req.AllowFirstMessage && fallback.Adapter == AdapterProtocolIM {
				fallback.Reason = "no_available_adapter"
				return fallback, nil
			}
			fallback.Adapter = ""
			fallback.Reason = "no_available_adapter"
		}
	}
	return fallback, nil
}

func (r *Resolver) isExecutable(adapter string) bool {
	if len(r.executable) == 0 {
		return true
	}
	_, ok := r.executable[adapter]
	return ok
}

func routeCandidates(req ResolveRequest) ([]routeCandidate, Route, error) {
	switch req.MessageKind {
	case "text":
		if req.HasConversation {
			return []routeCandidate{
				{adapter: AdapterProtocolIM, capability: NameMessageTextExisting},
				{adapter: AdapterBrowserConsumer, capability: NameMessageTextExisting},
			}, Route{Adapter: AdapterBrowserConsumer, Capability: NameMessageTextExisting, Reason: "capability_unavailable"}, nil
		}
		if req.AllowFirstMessage {
			return []routeCandidate{
				{adapter: AdapterProtocolIM, capability: NameMessageTextFirst},
			}, Route{Adapter: AdapterProtocolIM, Capability: NameMessageTextFirst, Reason: "first_message_adapter_unavailable"}, nil
		}
		return nil, Route{Capability: NameMessageTextExisting, Reason: "conversation_required"}, nil
	case "sticker":
		if !req.HasConversation {
			return nil, Route{Capability: NameMessageSticker, Reason: "conversation_required"}, nil
		}
		return []routeCandidate{{adapter: AdapterBrowserConsumer, capability: NameMessageSticker}},
			Route{Adapter: AdapterBrowserConsumer, Capability: NameMessageSticker, Reason: "capability_unavailable"}, nil
	default:
		return nil, Route{}, fmt.Errorf("capability resolver: unsupported message kind %q", req.MessageKind)
	}
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
	store   HealthRepository
	policy  HealthPolicy
	now     func() time.Time
	metrics *telemetry.Metrics
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

func (s *HealthService) WithMetrics(metrics *telemetry.Metrics) *HealthService {
	s.metrics = metrics
	return s
}

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
	err := s.store.RecordAdapterSuccess(ctx, adapter, version, checkedAt)
	if err == nil {
		s.metrics.SetGauge("adapter_health", 1, telemetry.Label{Name: "adapter", Value: adapter})
	}
	return err
}

func (s *HealthService) ObserveFailure(ctx context.Context, adapter, version, errorCode string, checkedAt time.Time) error {
	if s == nil || s.store == nil {
		return fmt.Errorf("capability health: repository is not configured")
	}
	openUntil := checkedAt.Add(s.policy.OpenFor)
	err := s.store.RecordAdapterFailure(ctx, adapter, version, errorCode,
		s.policy.FailureThreshold, openUntil, checkedAt)
	if err == nil {
		s.metrics.SetGauge("adapter_health", 0, telemetry.Label{Name: "adapter", Value: adapter})
	}
	return err
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
