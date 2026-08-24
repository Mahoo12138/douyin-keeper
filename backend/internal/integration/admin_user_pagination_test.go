package integration

import (
	"context"
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminUserListCursorPageIsStable(t *testing.T) {
	ctx := context.Background()
	newUser(t)
	newUser(t)
	newUser(t)
	service := admin.NewService(postgres.NewAdminRepo(pool, nil))
	first, err := service.ListUsersPage(ctx, admin.UserListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 || first.NextCreatedAt == nil {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListUsersPage(ctx, admin.UserListFilter{Limit: 2, AfterCreatedAt: first.NextCreatedAt, AfterID: first.NextAfterID})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) == 0 {
		t.Fatalf("second page is empty: %+v", second)
	}
	if first.Items[1].CreatedAt.Before(second.Items[0].CreatedAt) ||
		(first.Items[1].CreatedAt.Equal(second.Items[0].CreatedAt) && first.Items[1].ID <= second.Items[0].ID) {
		t.Fatalf("cursor order is not stable: first=%+v second=%+v", first, second)
	}
}
