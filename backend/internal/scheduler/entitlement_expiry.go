package scheduler

import (
	"context"
	"fmt"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
)

const (
	defaultEntitlementExpiryReminderLimit = 100
	entitlementExpiryReminderWindow       = 7 * 24 * time.Hour
)

type notificationCreator interface {
	Create(context.Context, *notification.Notification) error
}

type notificationCreateIfAbsent interface {
	CreateIfAbsent(context.Context, *notification.Notification) (bool, error)
}

// EntitlementExpiryReminder creates one in-app reminder at each 7/3/1-day
// threshold. The notification repository owns the (user_id, dedupe_key)
// uniqueness, so repeated scheduler scans are safe.
type EntitlementExpiryReminder struct {
	grants        entitlement.ExpiringGrantRepository
	notifications notificationCreator
	limit         int
	now           func() time.Time
}

type EntitlementExpiryStats struct {
	Scanned int
	Created int
}

func NewEntitlementExpiryReminder(grants entitlement.ExpiringGrantRepository, notifications notificationCreator, limit int) *EntitlementExpiryReminder {
	if limit <= 0 {
		limit = defaultEntitlementExpiryReminderLimit
	}
	return &EntitlementExpiryReminder{grants: grants, notifications: notifications, limit: limit, now: time.Now}
}

func (r *EntitlementExpiryReminder) SetNow(now func() time.Time) { r.now = now }

func (r *EntitlementExpiryReminder) RunOnce(ctx context.Context) (EntitlementExpiryStats, error) {
	if r == nil || r.grants == nil || r.notifications == nil {
		return EntitlementExpiryStats{}, fmt.Errorf("entitlement expiry reminder is not configured")
	}
	now := time.Now()
	if r.now != nil {
		now = r.now()
	}
	grants, err := r.grants.ListExpiringGrants(ctx, now, now.Add(entitlementExpiryReminderWindow), r.limit)
	if err != nil {
		return EntitlementExpiryStats{}, err
	}
	stats := EntitlementExpiryStats{Scanned: len(grants)}
	for _, grant := range grants {
		days, ok := entitlementExpiryReminderDays(grant.ExpiresAt.Sub(now))
		if !ok {
			continue
		}
		plan := grant.PlanCode
		if plan == "" {
			plan = "当前"
		}
		item := &notification.Notification{
			UserID: grant.UserID, Type: notification.TypeEntitlementExpiry,
			Priority: notification.PriorityWarning, Title: "权益即将到期",
			Body:         fmt.Sprintf("你的 %s 权益将在 %d 天内到期，请及时兑换新卡密。", plan, days),
			ResourceType: expiryStringPtr("entitlement_grant"), ResourceID: expiryStringPtr(grant.PublicID.String()),
			DedupeKey: fmt.Sprintf("entitlement-expiry:%s:%d", grant.PublicID, days),
			CreatedAt: now, ExpiresAt: &grant.ExpiresAt,
		}
		created, err := createExpiryNotification(ctx, r.notifications, item)
		if err != nil {
			return stats, err
		}
		if created {
			stats.Created++
		}
	}
	return stats, nil
}

func createExpiryNotification(ctx context.Context, creator notificationCreator, item *notification.Notification) (bool, error) {
	if creator, ok := creator.(notificationCreateIfAbsent); ok {
		return creator.CreateIfAbsent(ctx, item)
	}
	return true, creator.Create(ctx, item)
}

func entitlementExpiryReminderDays(remaining time.Duration) (int, bool) {
	switch {
	case remaining > 0 && remaining <= 24*time.Hour:
		return 1, true
	case remaining > 0 && remaining <= 3*24*time.Hour:
		return 3, true
	case remaining > 0 && remaining <= 7*24*time.Hour:
		return 7, true
	default:
		return 0, false
	}
}

func expiryStringPtr(value string) *string { return &value }
