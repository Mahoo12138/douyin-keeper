package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/risk"
)

func TestAdminRiskRepoListsFilteredSafeSummaries(t *testing.T) {
	ctx := context.Background()
	ownerID := newUser(t)
	acct := &account.Account{
		PublicID: uuid.New(), UserID: ownerID, Nickname: "风险账号",
		BindingStatus: account.BindingBound, SessionStatus: account.SessionValid,
		RiskStatus: account.RiskCoolingDown, CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := postgres.NewAccountRepo(pool).Create(ctx, acct); err != nil {
		t.Fatal(err)
	}
	adapter := "browser.consumer"
	action := "cooldown"
	event := &risk.Event{
		AccountID: acct.ID, Category: risk.CategoryPlatform, Code: "PLATFORM_RATE_LIMITED",
		Severity: risk.SeverityWarning, SourceAdapter: &adapter, Action: &action,
		CooldownUntil: ptrTime(time.Now().Add(10 * time.Minute)), CreatedAt: time.Now(),
		Detail: map[string]any{"message": "must not be returned"},
	}
	if err := postgres.NewRiskRepo(pool).Record(ctx, event); err != nil {
		t.Fatal(err)
	}

	items, err := postgres.NewAdminRepo(pool, nil).ListRiskSummaries(ctx, admin.RiskFilter{Category: "PLATFORM", Code: "RATE_LIMITED", Limit: 10})
	if err != nil || len(items) == 0 {
		t.Fatalf("risk summaries = %+v, err = %v", items, err)
	}
	item := items[0]
	if item.Code != event.Code || item.Nickname != acct.Nickname || item.OwnerDisplayName == "" || item.SourceAdapter == nil || item.Action == nil {
		t.Fatalf("risk summary = %+v", item)
	}
}

func ptrTime(value time.Time) *time.Time { return &value }
