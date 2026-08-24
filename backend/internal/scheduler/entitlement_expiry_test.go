package scheduler

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
)

type expiryGrantRepoStub struct {
	items  []entitlement.ExpiringGrant
	called bool
	now    time.Time
	until  time.Time
	limit  int
}

func (s *expiryGrantRepoStub) ListExpiringGrants(_ context.Context, now, until time.Time, limit int) ([]entitlement.ExpiringGrant, error) {
	s.called = true
	s.now, s.until, s.limit = now, until, limit
	return s.items, nil
}

type expiryNotificationRepoStub struct {
	items map[string]*notification.Notification
}

func (s *expiryNotificationRepoStub) Create(_ context.Context, item *notification.Notification) error {
	if s.items == nil {
		s.items = make(map[string]*notification.Notification)
	}
	if _, exists := s.items[item.DedupeKey]; exists {
		return nil
	}
	copy := *item
	s.items[item.DedupeKey] = &copy
	return nil
}

func (s *expiryNotificationRepoStub) CreateIfAbsent(_ context.Context, item *notification.Notification) (bool, error) {
	if s.items == nil {
		s.items = make(map[string]*notification.Notification)
	}
	if _, exists := s.items[item.DedupeKey]; exists {
		return false, nil
	}
	copy := *item
	s.items[item.DedupeKey] = &copy
	return true, nil
}

func TestEntitlementExpiryReminderCreatesThresholdNotifications(t *testing.T) {
	now := time.Date(2026, time.August, 24, 10, 0, 0, 0, time.UTC)
	grants := &expiryGrantRepoStub{items: []entitlement.ExpiringGrant{
		{UserID: 7, PublicID: uuid.New(), PlanCode: "standard", ExpiresAt: now.Add(6*24*time.Hour + time.Hour)},
		{UserID: 7, PublicID: uuid.New(), PlanCode: "pro", ExpiresAt: now.Add(2 * 24 * time.Hour)},
		{UserID: 8, PublicID: uuid.New(), PlanCode: "standard", ExpiresAt: now.Add(12 * time.Hour)},
		{UserID: 8, PublicID: uuid.New(), PlanCode: "standard", ExpiresAt: now.Add(8 * 24 * time.Hour)},
		{UserID: 8, PublicID: uuid.New(), PlanCode: "standard", ExpiresAt: now.Add(-time.Hour)},
	}}
	notifications := &expiryNotificationRepoStub{}
	reminder := NewEntitlementExpiryReminder(grants, notifications, 25)
	reminder.SetNow(func() time.Time { return now })

	stats, err := reminder.RunOnce(context.Background())
	if err != nil {
		t.Fatalf("RunOnce() error = %v", err)
	}
	if stats.Scanned != len(grants.items) || stats.Created != 3 {
		t.Fatalf("stats = %+v, want scanned=%d created=3", stats, len(grants.items))
	}
	if !grants.called || !grants.now.Equal(now) || !grants.until.Equal(now.Add(7*24*time.Hour)) || grants.limit != 25 {
		t.Fatalf("repository query = called:%v now:%v until:%v limit:%d", grants.called, grants.now, grants.until, grants.limit)
	}

	thresholds := map[int64]int{}
	for _, item := range notifications.items {
		thresholds[item.UserID]++
		if item.Type != notification.TypeEntitlementExpiry || item.Priority != notification.PriorityWarning {
			t.Fatalf("notification metadata = %+v", item)
		}
		if item.ResourceType == nil || *item.ResourceType != "entitlement_grant" || item.ResourceID == nil {
			t.Fatalf("notification resource = %+v", item)
		}
		if item.ExpiresAt == nil || !item.ExpiresAt.After(now) {
			t.Fatalf("notification expiry = %+v", item.ExpiresAt)
		}
	}
	if thresholds[7] != 2 || thresholds[8] != 1 {
		t.Fatalf("notifications by user = %v", thresholds)
	}

	second, err := reminder.RunOnce(context.Background())
	if err != nil {
		t.Fatalf("second RunOnce() error = %v", err)
	}
	if second.Scanned != len(grants.items) || second.Created != 0 || len(notifications.items) != 3 {
		t.Fatalf("second run stats/items = %+v/%d, want scanned=%d created=0 items=3", second, len(notifications.items), len(grants.items))
	}
}

func TestEntitlementExpiryReminderRejectsMissingDependencies(t *testing.T) {
	reminder := NewEntitlementExpiryReminder(nil, nil, 0)
	if _, err := reminder.RunOnce(context.Background()); err == nil {
		t.Fatal("RunOnce() error = nil, want configuration error")
	}
}

func TestEntitlementExpiryReminderDays(t *testing.T) {
	tests := []struct {
		name      string
		remaining time.Duration
		wantDays  int
		wantOK    bool
	}{
		{name: "one day", remaining: 24 * time.Hour, wantDays: 1, wantOK: true},
		{name: "three days", remaining: 3 * 24 * time.Hour, wantDays: 3, wantOK: true},
		{name: "seven days", remaining: 7 * 24 * time.Hour, wantDays: 7, wantOK: true},
		{name: "expired", remaining: -time.Second, wantOK: false},
		{name: "outside window", remaining: 8 * 24 * time.Hour, wantOK: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotDays, gotOK := entitlementExpiryReminderDays(tt.remaining)
			if gotDays != tt.wantDays || gotOK != tt.wantOK {
				t.Fatalf("entitlementExpiryReminderDays(%s) = %d, %v; want %d, %v", tt.remaining, gotDays, gotOK, tt.wantDays, tt.wantOK)
			}
		})
	}
}
