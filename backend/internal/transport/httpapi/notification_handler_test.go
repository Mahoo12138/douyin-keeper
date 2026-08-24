package httpapi

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
)

func TestNotificationViewFormatsOptionalDates(t *testing.T) {
	createdAt := time.Date(2026, 8, 24, 9, 0, 0, 0, time.UTC)
	readAt := createdAt.Add(time.Minute)
	resourceType, resourceID := "account", uuid.New().String()
	view := notificationViewFrom(&notification.Notification{
		PublicID: uuid.New(), Type: notification.TypeRiskEvent, Priority: notification.PriorityCritical,
		Title: "登录失效", Body: "请重新登录", ResourceType: &resourceType, ResourceID: &resourceID,
		ReadAt: &readAt, CreatedAt: createdAt,
	})
	if view.Priority != "critical" || view.CreatedAt != "2026-08-24T09:00:00Z" || view.ReadAt == nil || *view.ReadAt != "2026-08-24T09:01:00Z" {
		t.Fatalf("notification view = %+v", view)
	}
}

func TestNotificationFilterParsesUnreadAndLimit(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/v1/notifications?unread_only=true&limit=20", nil)
	filter, err := notificationFilter(req)
	if err != nil || !filter.UnreadOnly || filter.Limit != 20 {
		t.Fatalf("filter = %+v, err=%v", filter, err)
	}
	invalid := httptest.NewRequest("GET", "/api/v1/notifications?limit=nope", nil)
	if _, err := notificationFilter(invalid); err == nil {
		t.Fatal("invalid limit should be rejected")
	}
	invalidBool := httptest.NewRequest("GET", "/api/v1/notifications?unread_only=maybe", nil)
	if _, err := notificationFilter(invalidBool); err == nil {
		t.Fatal("invalid unread_only should be rejected")
	}
}
