package capability

import (
	"context"
	"testing"
	"time"
)

type fakeHealthRepository struct {
	health *AdapterHealth
}

func (f *fakeHealthRepository) GetAdapterHealth(context.Context, string) (*AdapterHealth, error) {
	if f.health == nil {
		return nil, nil
	}
	copy := *f.health
	return &copy, nil
}

func (f *fakeHealthRepository) RecordAdapterSuccess(_ context.Context, adapter, version string, checkedAt time.Time) error {
	versionPtr := version
	f.health = &AdapterHealth{Adapter: adapter, Status: AdapterStatusHealthy, Version: &versionPtr, CheckedAt: checkedAt}
	return nil
}

func (f *fakeHealthRepository) RecordAdapterFailure(_ context.Context, adapter, version, errorCode string, threshold int, openUntil, checkedAt time.Time) error {
	if f.health == nil {
		f.health = &AdapterHealth{Adapter: adapter}
	}
	f.health.FailureCount++
	versionPtr, codePtr := version, errorCode
	f.health.Version, f.health.ErrorCode, f.health.CheckedAt = &versionPtr, &codePtr, checkedAt
	f.health.Status = AdapterStatusDegraded
	if f.health.FailureCount >= threshold {
		f.health.Status = AdapterStatusOpen
		f.health.CircuitOpenUntil = &openUntil
	}
	return nil
}

func TestFromHealthMarksAdvertisedAndMissingCapabilities(t *testing.T) {
	checkedAt := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	snapshots := FromHealth(42, HealthSnapshot{
		Status:       "healthy",
		Adapter:      "browser.consumer",
		Capabilities: []string{NameSessionValidate, NameMessageTextExisting},
	}, checkedAt)
	if len(snapshots) != len(KnownNames) {
		t.Fatalf("got %d snapshots, want %d", len(snapshots), len(KnownNames))
	}
	byName := make(map[string]Capability, len(snapshots))
	for _, snapshot := range snapshots {
		byName[snapshot.Name] = snapshot
		if snapshot.AccountID != 42 || !snapshot.CheckedAt.Equal(checkedAt) {
			t.Fatalf("unexpected snapshot metadata: %+v", snapshot)
		}
		if snapshot.Adapter == nil || *snapshot.Adapter != "browser.consumer" {
			t.Fatalf("adapter was not retained: %+v", snapshot)
		}
	}
	if byName[NameSessionValidate].Status != StatusAvailable || byName[NameMessageTextExisting].Status != StatusAvailable {
		t.Fatalf("advertised capabilities were not available: %+v", byName)
	}
	if byName[NameFriendsSync].Status != StatusUnavailable || byName[NameConversationsSync].Status != StatusUnavailable || byName[NameLoginQR].Status != StatusUnavailable {
		t.Fatalf("missing capabilities were not unavailable: %+v", byName)
	}
}

func TestFromHealthAdvertisesConversationSync(t *testing.T) {
	snapshots := FromHealth(42, HealthSnapshot{
		Status:       AdapterStatusHealthy,
		Adapter:      AdapterBrowserConsumer,
		Capabilities: []string{NameConversationsSync},
	}, time.Now())
	for _, snapshot := range snapshots {
		if snapshot.Name == NameConversationsSync && snapshot.Status != StatusAvailable {
			t.Fatalf("conversation sync capability = %q, want %q", snapshot.Status, StatusAvailable)
		}
	}
}

func TestFromHealthMarksAllCapabilitiesDegradedWhenAdapterIsUnhealthy(t *testing.T) {
	snapshots := FromHealth(42, HealthSnapshot{Status: "degraded", Capabilities: KnownNames}, time.Now())
	for _, snapshot := range snapshots {
		if snapshot.Status != StatusDegraded {
			t.Fatalf("snapshot %q status = %q, want %q", snapshot.Name, snapshot.Status, StatusDegraded)
		}
	}
}

func TestHealthServiceOpensAfterConsecutiveFailuresAndRecovers(t *testing.T) {
	store := &fakeHealthRepository{}
	service := NewHealthService(store, HealthPolicy{FailureThreshold: 3, OpenFor: time.Minute})
	now := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	service.SetNow(func() time.Time { return now })

	allowed, err := service.Allow(context.Background(), AdapterBrowserConsumer)
	if err != nil || !allowed {
		t.Fatalf("missing health row should allow first probe: allowed=%v err=%v", allowed, err)
	}
	for i := 1; i <= 2; i++ {
		if err := service.ObserveFailure(context.Background(), AdapterBrowserConsumer, "1", "ADAPTER_INCOMPATIBLE", now); err != nil {
			t.Fatal(err)
		}
		allowed, err = service.Allow(context.Background(), AdapterBrowserConsumer)
		if err != nil || !allowed {
			t.Fatalf("circuit opened too early after failure %d: allowed=%v err=%v", i, allowed, err)
		}
	}
	if err := service.ObserveFailure(context.Background(), AdapterBrowserConsumer, "1", "ADAPTER_INCOMPATIBLE", now); err != nil {
		t.Fatal(err)
	}
	allowed, err = service.Allow(context.Background(), AdapterBrowserConsumer)
	if err != nil || allowed {
		t.Fatalf("circuit should be open: allowed=%v err=%v", allowed, err)
	}
	if err := service.ObserveSuccess(context.Background(), AdapterBrowserConsumer, "1", now); err != nil {
		t.Fatal(err)
	}
	allowed, err = service.Allow(context.Background(), AdapterBrowserConsumer)
	if err != nil || !allowed || store.health.Status != AdapterStatusHealthy || store.health.FailureCount != 0 {
		t.Fatalf("success did not recover circuit: health=%+v allowed=%v err=%v", store.health, allowed, err)
	}
}

func TestHealthServiceKeepsDisabledAdapterClosed(t *testing.T) {
	store := &fakeHealthRepository{health: &AdapterHealth{Adapter: AdapterBrowserConsumer, Status: AdapterStatusDisabled}}
	service := NewHealthService(store, DefaultHealthPolicy())
	allowed, err := service.Allow(context.Background(), AdapterBrowserConsumer)
	if err != nil || allowed {
		t.Fatalf("disabled adapter should be blocked: allowed=%v err=%v", allowed, err)
	}
}

func TestIsCircuitFailureCode(t *testing.T) {
	if !IsCircuitFailureCode("ADAPTER_INCOMPATIBLE") || !IsCircuitFailureCode("BROWSER_SELECTOR_CHANGED") {
		t.Fatal("compatibility failures should trip the circuit")
	}
	if IsCircuitFailureCode("NETWORK_TIMEOUT") {
		t.Fatal("network timeout should not trip the compatibility circuit")
	}
}
