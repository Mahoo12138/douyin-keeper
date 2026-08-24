package scheduler

import (
	"context"
	"testing"
	"time"
)

type fakeRiskCooldownStore struct {
	now   time.Time
	limit int
}

func (f *fakeRiskCooldownStore) ClearExpiredRiskCooldowns(_ context.Context, now time.Time, limit int) (int, error) {
	f.now, f.limit = now, limit
	return 2, nil
}

func TestRiskCooldownReaperUsesBoundedNow(t *testing.T) {
	now := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	store := &fakeRiskCooldownStore{}
	reaper := NewRiskCooldownReaper(store, 25)
	reaper.SetNow(func() time.Time { return now })
	count, err := reaper.RunOnce(context.Background())
	if err != nil || count != 2 {
		t.Fatalf("count=%d err=%v", count, err)
	}
	if !store.now.Equal(now) || store.limit != 25 {
		t.Fatalf("cleanup arguments now=%v limit=%d", store.now, store.limit)
	}
}
