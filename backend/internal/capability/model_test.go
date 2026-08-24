package capability

import (
	"testing"
	"time"
)

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
	if byName[NameFriendsSync].Status != StatusUnavailable || byName[NameLoginQR].Status != StatusUnavailable {
		t.Fatalf("missing capabilities were not unavailable: %+v", byName)
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
