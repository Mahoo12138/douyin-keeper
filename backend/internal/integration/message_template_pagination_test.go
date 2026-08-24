package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/messagetemplate"
)

func TestMessageTemplateListCursorPageIsStableAndScoped(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	otherUserID := newUser(t)
	repo := postgres.NewMessageTemplateRepo(pool)
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	for index := 0; index < 3; index++ {
		at := base.Add(time.Duration(index) * time.Minute)
		if err := repo.Create(ctx, &messagetemplate.Template{
			PublicID: uuid.New(), UserID: userID, Name: "分页模板" + uuid.NewString(), Kind: messagetemplate.KindText,
			Body: "模板内容", CreatedAt: at, UpdatedAt: at,
		}); err != nil {
			t.Fatal(err)
		}
	}
	if err := repo.Create(ctx, &messagetemplate.Template{
		PublicID: uuid.New(), UserID: otherUserID, Name: "其他用户模板", Kind: messagetemplate.KindText,
		Body: "不应返回", CreatedAt: base.Add(3 * time.Minute), UpdatedAt: base.Add(3 * time.Minute),
	}); err != nil {
		t.Fatal(err)
	}

	service := messagetemplate.NewService(repo)
	first, err := service.ListPageForUser(ctx, userID, messagetemplate.ListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 || first.NextUpdatedAt == nil {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListPageForUser(ctx, userID, messagetemplate.ListFilter{
		Limit: 2, AfterUpdatedAt: first.NextUpdatedAt, AfterID: first.NextAfterID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) != 1 || second.NextAfterID != 0 || second.NextUpdatedAt != nil {
		t.Fatalf("second page = %+v", second)
	}
	if first.Items[1].UpdatedAt.Before(second.Items[0].UpdatedAt) || first.Items[1].ID <= second.Items[0].ID {
		t.Fatalf("cursor order is not stable: first=%+v second=%+v", first, second)
	}
}
