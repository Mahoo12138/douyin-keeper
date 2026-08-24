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
	freshAt := checkedAt.Add(time.Minute)
	if err := repo.Upsert(ctx, capability.Capability{
		AccountID: acct.ID, Name: capability.NameMessageTextExisting,
		Status: capability.StatusUnavailable, ErrorCode: &errorCode, CheckedAt: freshAt,
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
	stale, err := repo.ListStaleProbeTargets(ctx, freshAt.Add(-time.Second), 1000)
	if err != nil {
		t.Fatal(err)
	}
	for _, target := range stale {
		if target.AccountID == acct.ID {
			t.Fatalf("fresh capability snapshot was returned as stale: %+v", target)
		}
	}
	stale, err = repo.ListStaleProbeTargets(ctx, freshAt.Add(time.Second), 1000)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, target := range stale {
		if target.AccountID == acct.ID && target.PublicID == acct.PublicID {
			found = true
		}
	}
	if !found {
		t.Fatalf("account was not returned after snapshot became stale: %+v", stale)
	}

	for i := 0; i < 3; i++ {
		if err := repo.RecordAdapterFailure(ctx, capability.AdapterBrowserConsumer, "0.1.0", "ADAPTER_INCOMPATIBLE", 3, checkedAt.Add(10*time.Minute), checkedAt.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatal(err)
		}
	}
	health, err := repo.GetAdapterHealth(ctx, capability.AdapterBrowserConsumer)
	if err != nil || health == nil || health.Status != capability.AdapterStatusOpen || health.FailureCount != 3 || health.CircuitOpenUntil == nil {
		t.Fatalf("adapter circuit was not opened: health=%+v err=%v", health, err)
	}
	if err := repo.RecordAdapterSuccess(ctx, capability.AdapterBrowserConsumer, "0.1.0", checkedAt.Add(20*time.Minute)); err != nil {
		t.Fatal(err)
	}
	health, err = repo.GetAdapterHealth(ctx, capability.AdapterBrowserConsumer)
	if err != nil || health == nil || health.Status != capability.AdapterStatusHealthy || health.FailureCount != 0 || health.CircuitOpenUntil != nil {
		t.Fatalf("adapter circuit did not recover: health=%+v err=%v", health, err)
	}
}

func TestCapabilityRepoIgnoresStaleAdapterHealthObservations(t *testing.T) {
	ctx := context.Background()
	repo := postgres.NewCapabilityRepo(pool)
	adapter := "test.adapter.health.ordering"
	first := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	newer := first.Add(2 * time.Minute)

	if err := repo.RecordAdapterSuccess(ctx, adapter, "1.0.0", newer); err != nil {
		t.Fatal(err)
	}
	if err := repo.RecordAdapterFailure(ctx, adapter, "1.0.0", "ADAPTER_INCOMPATIBLE", 3, newer.Add(10*time.Minute), first); err != nil {
		t.Fatal(err)
	}
	health, err := repo.GetAdapterHealth(ctx, adapter)
	if err != nil || health == nil {
		t.Fatalf("lookup after stale failure: health=%+v err=%v", health, err)
	}
	if health.Status != capability.AdapterStatusHealthy || health.FailureCount != 0 || !health.CheckedAt.Equal(newer) {
		t.Fatalf("stale failure regressed newer success: %+v", health)
	}

	laterFailure := newer.Add(time.Minute)
	if err := repo.RecordAdapterFailure(ctx, adapter, "1.0.0", "ADAPTER_INCOMPATIBLE", 3, laterFailure.Add(10*time.Minute), laterFailure); err != nil {
		t.Fatal(err)
	}
	if err := repo.RecordAdapterSuccess(ctx, adapter, "1.0.0", newer.Add(30*time.Second)); err != nil {
		t.Fatal(err)
	}
	health, err = repo.GetAdapterHealth(ctx, adapter)
	if err != nil || health == nil {
		t.Fatalf("lookup after stale success: health=%+v err=%v", health, err)
	}
	if health.Status != capability.AdapterStatusDegraded || health.FailureCount != 1 || !health.CheckedAt.Equal(laterFailure) {
		t.Fatalf("stale success regressed newer failure: %+v", health)
	}
}

func TestDisabledAdapterCannotBecomeFallbackRoute(t *testing.T) {
	ctx := context.Background()
	actorID := newUser(t)
	acct := &account.Account{
		PublicID: uuid.New(), UserID: newUser(t), BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := postgres.NewAccountRepo(pool).Create(ctx, acct); err != nil {
		t.Fatal(err)
	}

	adapter := capability.AdapterBrowserConsumer
	if err := postgres.NewCapabilityRepo(pool).Upsert(ctx, capability.Capability{
		AccountID: acct.ID, Name: capability.NameMessageTextExisting,
		Status: capability.StatusAvailable, Adapter: &adapter, CheckedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}

	adminRepo := postgres.NewAdminRepo(pool, nil)
	if _, err := adminRepo.SetAdapterEnabled(ctx, actorID, adapter, false); err != nil {
		t.Fatalf("disable adapter: %v", err)
	}
	defer func() {
		if _, err := adminRepo.SetAdapterEnabled(ctx, actorID, adapter, true); err != nil {
			t.Errorf("restore adapter: %v", err)
		}
	}()

	capabilityRepo := postgres.NewCapabilityRepo(pool)
	health := capability.NewHealthService(capabilityRepo, capability.DefaultHealthPolicy())
	resolver := capability.NewResolver(capabilityRepo, health, capability.AdapterBrowserConsumer)
	route, err := resolver.Resolve(ctx, acct.ID, capability.ResolveRequest{
		MessageKind: "text", HasConversation: true,
	})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if route.Adapter != "" || route.Available || route.Reason != "no_available_adapter" {
		t.Fatalf("disabled adapter fallback route = %+v", route)
	}
}
