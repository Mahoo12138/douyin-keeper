package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/risk"
)

func TestRiskRepoAndCooldownCleanup(t *testing.T) {
	ctx := context.Background()
	acct := &account.Account{
		PublicID: uuid.New(), UserID: newUser(t), BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskCoolingDown,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	accounts := postgres.NewAccountRepo(pool)
	if err := accounts.Create(ctx, acct); err != nil {
		t.Fatal(err)
	}
	until := time.Now().Add(-time.Minute)
	if err := accounts.SetRiskStatus(ctx, acct.ID, account.RiskCoolingDown, &until); err != nil {
		t.Fatal(err)
	}
	events := postgres.NewRiskRepo(pool)
	adapter := "browser.consumer"
	event := &risk.Event{
		AccountID: acct.ID, Category: risk.CategoryPlatform, Code: "PLATFORM_RATE_LIMITED",
		Severity: risk.SeverityWarning, SourceAdapter: &adapter,
		Action: stringPtr("cooldown"), CooldownUntil: &until, CreatedAt: time.Now(),
		Detail: map[string]any{"operation": "message.send_text"},
	}
	if err := events.Record(ctx, event); err != nil {
		t.Fatal(err)
	}
	list, err := events.ListByAccount(ctx, acct.ID, 10)
	if err != nil || len(list) != 1 || list[0].Code != event.Code || list[0].Detail["operation"] != "message.send_text" {
		t.Fatalf("risk event mismatch: list=%+v err=%v", list, err)
	}
	count, err := accounts.ClearExpiredRiskCooldowns(ctx, time.Now(), 10)
	if err != nil || count != 1 {
		t.Fatalf("cleanup count=%d err=%v", count, err)
	}
	got, err := accounts.GetByID(ctx, acct.ID)
	if err != nil || got.RiskStatus != account.RiskNormal || got.CooldownUntil != nil {
		t.Fatalf("cooldown was not cleared: account=%+v err=%v", got, err)
	}
}

func stringPtr(value string) *string { return &value }
