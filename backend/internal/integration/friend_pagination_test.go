package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestFriendListCursorPageIsStableAndScoped(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	acct := &account.Account{
		PublicID: uuid.New(), UserID: userID, BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := postgres.NewAccountRepo(pool).Create(ctx, acct); err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 3; index++ {
		if _, err := pool.Exec(ctx, `
			INSERT INTO friends (public_id, account_id, platform_user_id, identity_status, display_name, nickname)
			VALUES ($1,$2,$3,'resolved',$4,$4)`, uuid.New(), acct.ID, "pagination-"+uuid.NewString(), "分页好友"); err != nil {
			t.Fatal(err)
		}
	}

	service := friend.NewService(postgres.NewFriendRepo(pool), nil)
	first, err := service.ListPageForAccount(ctx, userID, acct.PublicID, friend.ListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListPageForAccount(ctx, userID, acct.PublicID, friend.ListFilter{Limit: 2, AfterID: first.NextAfterID})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) != 1 || second.NextAfterID != 0 {
		t.Fatalf("second page = %+v", second)
	}
	if first.Items[1].ID <= second.Items[0].ID {
		// The cursor is a descending internal-id seek; this guards against
		// accidentally returning the boundary item again.
		t.Fatalf("cursor order is not descending: first=%+v second=%+v", first, second)
	}
}
