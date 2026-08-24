package integration

import (
	"context"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
	"github.com/mahoo12138/douyin-keeper/backend/internal/scheduler"
)

func TestEntitlementExpiryReminderIntegration(t *testing.T) {
	ctx := context.Background()
	ent := newEntSvc()
	adminID := newUser(t)
	userID := newUser(t)
	code, _ := seedCard(t, ent, adminID)
	grant, _, err := ent.Redeem(ctx, userID, code)
	if err != nil {
		t.Fatalf("redeem: %v", err)
	}

	now := time.Now().UTC().Truncate(time.Microsecond)
	expiresAt := now.Add(2 * 24 * time.Hour)
	if _, err := pool.Exec(ctx, `
		UPDATE entitlement_grants
		SET starts_at=$2, expires_at=$3
		WHERE public_id=$1`, grant.PublicID, now.Add(-time.Hour), expiresAt); err != nil {
		t.Fatalf("set grant expiry: %v", err)
	}

	reminder := scheduler.NewEntitlementExpiryReminder(
		postgres.NewEntitlementRepo(pool), postgres.NewNotificationRepo(pool), 100)
	reminder.SetNow(func() time.Time { return now })
	stats, err := reminder.RunOnce(ctx)
	if err != nil || stats.Scanned != 1 || stats.Created != 1 {
		t.Fatalf("first reminder run = %+v, err=%v", stats, err)
	}

	notifications := postgres.NewNotificationRepo(pool)
	items, _, err := notifications.List(ctx, userID, notification.ListFilter{Limit: 100})
	if err != nil || len(items) != 1 {
		t.Fatalf("expiry notifications = %+v, err=%v", items, err)
	}
	item := items[0]
	if item.Type != notification.TypeEntitlementExpiry || item.Priority != notification.PriorityWarning ||
		item.ResourceType == nil || *item.ResourceType != "entitlement_grant" ||
		item.ResourceID == nil || *item.ResourceID != grant.PublicID.String() ||
		item.DedupeKey != "entitlement-expiry:"+grant.PublicID.String()+":3" {
		t.Fatalf("expiry notification = %+v", item)
	}
	if item.ExpiresAt == nil || !item.ExpiresAt.Equal(expiresAt) {
		t.Fatalf("notification expires_at = %v, want %v", item.ExpiresAt, expiresAt)
	}

	second, err := reminder.RunOnce(ctx)
	if err != nil || second.Scanned != 0 || second.Created != 0 {
		t.Fatalf("second reminder run = %+v, err=%v", second, err)
	}
	items, _, err = notifications.List(ctx, userID, notification.ListFilter{Limit: 100})
	if err != nil || len(items) != 1 {
		t.Fatalf("deduped expiry notifications = %+v, err=%v", items, err)
	}
}
