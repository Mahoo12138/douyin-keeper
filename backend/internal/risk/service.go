package risk

import (
	"context"
	"fmt"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
)

const DefaultCooldown = 10 * time.Minute

type AccountState interface {
	SetRiskStatus(ctx context.Context, accountID int64, status account.RiskStatus, cooldownUntil *time.Time) error
	SetSessionStatus(ctx context.Context, accountID int64, status account.SessionStatus, checkedAt time.Time) error
}

type TxManager interface {
	WithinTx(ctx context.Context, fn func(context.Context) error) error
}

type Classification struct {
	Category      Category
	Severity      Severity
	Action        string
	SessionStatus *account.SessionStatus
	CoolingDown   bool
}

func Classify(code string) Classification {
	switch code {
	case "SESSION_EXPIRED":
		status := account.SessionExpired
		return Classification{Category: CategoryAuth, Severity: SeverityCritical,
			Action: "session_expired", SessionStatus: &status}
	case "CHALLENGE_REQUIRED":
		status := account.SessionChallengeRequired
		return Classification{Category: CategoryAuth, Severity: SeverityWarning,
			Action: "challenge_required", SessionStatus: &status}
	case "PLATFORM_RATE_LIMITED":
		return Classification{Category: CategoryPlatform, Severity: SeverityWarning,
			Action: "cooldown", CoolingDown: true}
	case "ADAPTER_INCOMPATIBLE", "UNSUPPORTED_PROTOCOL_VERSION":
		return Classification{Category: CategoryProtocol, Severity: SeverityCritical,
			Action: "adapter_circuit_open"}
	case "BROWSER_SELECTOR_CHANGED":
		return Classification{Category: CategoryBrowser, Severity: SeverityCritical,
			Action: "capability_degraded"}
	case "NETWORK_TIMEOUT":
		return Classification{Category: CategoryNetwork, Severity: SeverityInfo,
			Action: "bounded_retry"}
	case "FRIEND_AMBIGUOUS", "TARGET_IDENTITY_MISMATCH", "CONVERSATION_NOT_FOUND":
		return Classification{Category: CategoryData, Severity: SeverityWarning,
			Action: "send_blocked"}
	default:
		return Classification{Category: CategoryPlatform, Severity: SeverityWarning,
			Action: "adapter_unavailable"}
	}
}

type Service struct {
	events   Repository
	accounts AccountState
	tx       TxManager
	notifier Notifier
	cooldown time.Duration
	now      func() time.Time
}

type Notifier interface {
	NotifyRisk(ctx context.Context, accountID int64, code string, severity string, createdAt time.Time) error
}

func NewService(events Repository, accounts AccountState, tx TxManager, cooldown time.Duration) *Service {
	if cooldown <= 0 {
		cooldown = DefaultCooldown
	}
	return &Service{events: events, accounts: accounts, tx: tx, cooldown: cooldown, now: time.Now}
}

func (s *Service) SetNow(now func() time.Time) { s.now = now }

func (s *Service) WithNotifier(notifier Notifier) *Service {
	s.notifier = notifier
	return s
}

// Apply records a stable risk event and applies the associated account action
// atomically. It never changes session state for protocol/browser/data errors.
func (s *Service) Apply(ctx context.Context, accountID int64, code, sourceAdapter string, detail map[string]any) error {
	if s == nil || s.events == nil || s.accounts == nil || s.tx == nil {
		return fmt.Errorf("risk service is not configured")
	}
	if accountID <= 0 || code == "" {
		return fmt.Errorf("risk event requires account_id and code")
	}
	now := time.Now()
	if s.now != nil {
		now = s.now()
	}
	classification := Classify(code)
	event := &Event{
		AccountID: accountID, Category: classification.Category, Code: code,
		Severity: classification.Severity, Detail: detail, CreatedAt: now,
	}
	if sourceAdapter != "" {
		adapter := sourceAdapter
		event.SourceAdapter = &adapter
	}
	if classification.Action != "" {
		action := classification.Action
		event.Action = &action
	}
	return s.tx.WithinTx(ctx, func(tctx context.Context) error {
		if classification.SessionStatus != nil {
			if err := s.accounts.SetSessionStatus(tctx, accountID, *classification.SessionStatus, now); err != nil {
				return err
			}
		}
		if classification.CoolingDown {
			until := now.Add(s.cooldown)
			event.CooldownUntil = &until
			if err := s.accounts.SetRiskStatus(tctx, accountID, account.RiskCoolingDown, &until); err != nil {
				return err
			}
		}
		if err := s.events.Record(tctx, event); err != nil {
			return err
		}
		if s.notifier != nil {
			if err := s.notifier.NotifyRisk(tctx, accountID, code, string(classification.Severity), now); err != nil {
				return err
			}
		}
		return nil
	})
}
