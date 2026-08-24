package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAccountSummaryListCursorPageIsStableAndScoped(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	otherUserID := newUser(t)
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	repo := postgres.NewAccountRepo(pool)
	for index := 0; index < 3; index++ {
		item := &account.Account{
			PublicID: uuid.New(), UserID: userID, Nickname: "分页账号" + uuid.NewString(),
			BindingStatus: account.BindingBound, SessionStatus: account.SessionValid,
			RiskStatus: account.RiskNormal, CreatedAt: base, UpdatedAt: base,
		}
		if err := repo.Create(ctx, item); err != nil {
			t.Fatal(err)
		}
	}
	other := &account.Account{
		PublicID: uuid.New(), UserID: otherUserID, Nickname: "其他用户账号",
		BindingStatus: account.BindingBound, SessionStatus: account.SessionValid,
		RiskStatus: account.RiskNormal, CreatedAt: base, UpdatedAt: base,
	}
	if err := repo.Create(ctx, other); err != nil {
		t.Fatal(err)
	}

	service := account.NewService(repo, nil, nil, nil, nil, nil)
	first, err := service.ListOwnedSummaryPage(ctx, userID, account.SummaryListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListOwnedSummaryPage(ctx, userID, account.SummaryListFilter{Limit: 2, AfterID: first.NextAfterID})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) != 1 || second.NextAfterID != 0 {
		t.Fatalf("second page = %+v", second)
	}
	if first.Items[1].Account.ID <= second.Items[0].Account.ID {
		t.Fatalf("cursor order is not descending: first=%+v second=%+v", first, second)
	}
}
