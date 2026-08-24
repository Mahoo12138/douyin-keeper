package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
)

func TestNotificationListCursorPageIsStableAndScoped(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	otherUserID := newUser(t)
	repo := postgres.NewNotificationRepo(pool)
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	for index := 0; index < 3; index++ {
		if err := repo.Create(ctx, &notification.Notification{
			PublicID: uuid.New(), UserID: userID, Type: notification.TypeRiskEvent,
			Priority: notification.PriorityWarning, Title: "分页通知", Body: "通知内容",
			CreatedAt: base.Add(time.Duration(index) * time.Minute),
		}); err != nil {
			t.Fatal(err)
		}
	}
	if err := repo.Create(ctx, &notification.Notification{
		PublicID: uuid.New(), UserID: otherUserID, Type: notification.TypeRiskEvent,
		Priority: notification.PriorityWarning, Title: "其他用户通知", Body: "不应返回",
		CreatedAt: base.Add(3 * time.Minute),
	}); err != nil {
		t.Fatal(err)
	}

	service := notification.NewService(repo)
	first, err := service.ListPage(ctx, userID, notification.ListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 || first.NextCreatedAt == nil {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListPage(ctx, userID, notification.ListFilter{
		Limit: 2, AfterCreatedAt: first.NextCreatedAt, AfterID: first.NextAfterID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) != 1 || second.NextAfterID != 0 || second.NextCreatedAt != nil {
		t.Fatalf("second page = %+v", second)
	}
	if first.Items[1].CreatedAt.Before(second.Items[0].CreatedAt) || first.Items[1].ID <= second.Items[0].ID {
		t.Fatalf("cursor order is not stable: first=%+v second=%+v", first, second)
	}
}
