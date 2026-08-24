package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestCapabilityRepoUpsertAndLookup(t *testing.T) {
	ctx := context.Background()
	acct := &account.Account{
		PublicID: uuid.New(), UserID: newUser(t), BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := postgres.NewAccountRepo(pool).Create(ctx, acct); err != nil {
		t.Fatal(err)
	}
	repo := postgres.NewCapabilityRepo(pool)
	checkedAt := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	adapter := "browser.consumer"
	if err := repo.Upsert(ctx, capability.Capability{
		AccountID: acct.ID, Name: capability.NameMessageTextExisting,
		Status: capability.StatusAvailable, Adapter: &adapter, CheckedAt: checkedAt,
	}); err != nil {
		t.Fatal(err)
	}
	got, err := repo.GetByAccountAndName(ctx, acct.ID, capability.NameMessageTextExisting)
	if err != nil || got == nil {
		t.Fatalf("lookup: got=%+v err=%v", got, err)
	}
	if got.Status != capability.StatusAvailable || got.Adapter == nil || *got.Adapter != adapter || !got.CheckedAt.Equal(checkedAt) {
		t.Fatalf("unexpected snapshot: %+v", got)
	}

	errorCode := "ADAPTER_UNAVAILABLE"
	if err := repo.Upsert(ctx, capability.Capability{
		AccountID: acct.ID, Name: capability.NameMessageTextExisting,
		Status: capability.StatusUnavailable, ErrorCode: &errorCode, CheckedAt: checkedAt.Add(time.Minute),
	}); err != nil {
		t.Fatal(err)
	}
	got, err = repo.GetByAccountAndName(ctx, acct.ID, capability.NameMessageTextExisting)
	if err != nil || got == nil || got.Status != capability.StatusUnavailable || got.ErrorCode == nil || *got.ErrorCode != errorCode {
		t.Fatalf("upsert did not replace snapshot: got=%+v err=%v", got, err)
	}
	list, err := repo.ListByAccount(ctx, acct.ID)
	if err != nil || len(list) != 1 {
		t.Fatalf("list: got=%+v err=%v", list, err)
	}
}
