package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminAccountListCursorPageIsStable(t *testing.T) {
	ctx := context.Background()
	accounts := postgres.NewAccountRepo(pool)
	for i := 0; i < 3; i++ {
		ownerID := newUser(t)
		now := time.Now().UTC()
		item := &account.Account{
			PublicID: uuid.New(), UserID: ownerID, Nickname: "分页账号",
			BindingStatus: account.BindingBound, SessionStatus: account.SessionValid,
			RiskStatus: account.RiskNormal, CreatedAt: now, UpdatedAt: now,
		}
		if err := accounts.Create(ctx, item); err != nil {
			t.Fatal(err)
		}
	}

	service := admin.NewService(postgres.NewAdminRepo(pool, nil))
	first, err := service.ListAccountsPage(ctx, admin.AccountListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 || first.NextCreatedAt == nil {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListAccountsPage(ctx, admin.AccountListFilter{Limit: 2, AfterCreatedAt: first.NextCreatedAt, AfterID: first.NextAfterID})
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
