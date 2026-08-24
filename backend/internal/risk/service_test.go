package risk

import (
	"context"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
)

type fakeRiskEvents struct{ events []*Event }

func (f *fakeRiskEvents) Record(_ context.Context, event *Event) error {
	f.events = append(f.events, event)
	return nil
}

func (f *fakeRiskEvents) ListByAccount(context.Context, int64, int) ([]*Event, error) {
	return f.events, nil
}

type fakeRiskAccounts struct {
	riskStatus    account.RiskStatus
	cooldownUntil *time.Time
	sessionStatus account.SessionStatus
	checkedAt     time.Time
}

func (f *fakeRiskAccounts) SetRiskStatus(_ context.Context, _ int64, status account.RiskStatus, until *time.Time) error {
	f.riskStatus, f.cooldownUntil = status, until
	return nil
}

func (f *fakeRiskAccounts) SetSessionStatus(_ context.Context, _ int64, status account.SessionStatus, checkedAt time.Time) error {
	f.sessionStatus, f.checkedAt = status, checkedAt
	return nil
}

type fakeRiskTx struct{}

func (fakeRiskTx) WithinTx(ctx context.Context, fn func(context.Context) error) error { return fn(ctx) }

func TestClassifyRiskActions(t *testing.T) {
	tests := map[string]struct {
		category Category
		action   string
	}{
		"SESSION_EXPIRED":          {CategoryAuth, "session_expired"},
		"CHALLENGE_REQUIRED":       {CategoryAuth, "challenge_required"},
		"PLATFORM_RATE_LIMITED":    {CategoryPlatform, "cooldown"},
		"ADAPTER_INCOMPATIBLE":     {CategoryProtocol, "adapter_circuit_open"},
		"BROWSER_SELECTOR_CHANGED": {CategoryBrowser, "capability_degraded"},
		"NETWORK_TIMEOUT":          {CategoryNetwork, "bounded_retry"},
		"FRIEND_AMBIGUOUS":         {CategoryData, "send_blocked"},
	}
	for code, want := range tests {
		got := Classify(code)
		if got.Category != want.category || got.Action != want.action {
			t.Errorf("Classify(%q) = %+v, want category=%q action=%q", code, got, want.category, want.action)
		}
	}
}

func TestApplyRecordsEventAndAppliesCooldownAtomically(t *testing.T) {
	events := &fakeRiskEvents{}
	accounts := &fakeRiskAccounts{}
	service := NewService(events, accounts, fakeRiskTx{}, time.Minute)
	now := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	service.SetNow(func() time.Time { return now })
	if err := service.Apply(context.Background(), 42, "PLATFORM_RATE_LIMITED", "browser.consumer", map[string]any{"operation": "message.send_text"}); err != nil {
		t.Fatal(err)
	}
	if accounts.riskStatus != account.RiskCoolingDown || accounts.cooldownUntil == nil || !accounts.cooldownUntil.Equal(now.Add(time.Minute)) {
		t.Fatalf("cooldown action mismatch: status=%s until=%v", accounts.riskStatus, accounts.cooldownUntil)
	}
	if len(events.events) != 1 || events.events[0].Category != CategoryPlatform || events.events[0].Action == nil || *events.events[0].Action != "cooldown" {
		t.Fatalf("event mismatch: %+v", events.events)
	}
	if events.events[0].SourceAdapter == nil || *events.events[0].SourceAdapter != "browser.consumer" || events.events[0].CooldownUntil == nil {
		t.Fatalf("event metadata mismatch: %+v", events.events[0])
	}
}

func TestApplySessionFailureDoesNotSetRiskCooldown(t *testing.T) {
	events := &fakeRiskEvents{}
	accounts := &fakeRiskAccounts{}
	service := NewService(events, accounts, fakeRiskTx{}, time.Minute)
	now := time.Now()
	service.SetNow(func() time.Time { return now })
	if err := service.Apply(context.Background(), 42, "SESSION_EXPIRED", "browser.consumer", nil); err != nil {
		t.Fatal(err)
	}
	if accounts.sessionStatus != account.SessionExpired || !accounts.checkedAt.Equal(now) {
		t.Fatalf("session action mismatch: %+v", accounts)
	}
	if accounts.riskStatus != "" || accounts.cooldownUntil != nil {
		t.Fatalf("session failure unexpectedly changed risk cooldown: %+v", accounts)
	}
}
