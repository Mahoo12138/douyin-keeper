package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

func TestSendIntentListCursorPageIsStableAndScoped(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	otherUserID := newUser(t)
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	accountRepo := postgres.NewAccountRepo(pool)
	userAccount := &account.Account{
		PublicID: uuid.New(), UserID: userID, BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: base, UpdatedAt: base,
	}
	if err := accountRepo.Create(ctx, userAccount); err != nil {
		t.Fatal(err)
	}
	var userFriendID int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO friends (public_id, account_id, platform_user_id, identity_status, display_name, nickname)
		VALUES ($1,$2,$3,'resolved','分页好友','分页好友') RETURNING id`,
		uuid.New(), userAccount.ID, "send-page-user-"+uuid.NewString()).Scan(&userFriendID); err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 3; index++ {
		at := base.Add(time.Duration(index) * time.Minute)
		if _, err := pool.Exec(ctx, `
			INSERT INTO send_intents (public_id, intent_type, request_id, account_id, friend_id, scheduled_at, status, created_at, updated_at)
			VALUES ($1,'manual',$2,$3,$4,$5,'succeeded',$5,$5)`,
			uuid.New(), uuid.New(), userAccount.ID, userFriendID, at); err != nil {
			t.Fatal(err)
		}
	}
	otherAccount := &account.Account{
		PublicID: uuid.New(), UserID: otherUserID, BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: base, UpdatedAt: base,
	}
	if err := accountRepo.Create(ctx, otherAccount); err != nil {
		t.Fatal(err)
	}
	var otherFriendID int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO friends (public_id, account_id, platform_user_id, identity_status, display_name, nickname)
		VALUES ($1,$2,$3,'resolved','其他用户好友','其他用户好友') RETURNING id`,
		uuid.New(), otherAccount.ID, "send-page-other-"+uuid.NewString()).Scan(&otherFriendID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO send_intents (public_id, intent_type, request_id, account_id, friend_id, scheduled_at, status, created_at, updated_at)
		VALUES ($1,'manual',$2,$3,$4,$5,'failed',$5,$5)`,
		uuid.New(), uuid.New(), otherAccount.ID, otherFriendID, base.Add(3*time.Minute)); err != nil {
		t.Fatal(err)
	}

	service := send.NewService(postgres.NewSendRepo(pool), nil, nil, nil, nil, nil)
	first, err := service.ListIntentsPage(ctx, userID, send.IntentListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListIntentsPage(ctx, userID, send.IntentListFilter{Limit: 2, AfterID: first.NextAfterID})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) != 1 || second.NextAfterID != 0 {
		t.Fatalf("second page = %+v", second)
	}
	if first.Items[1].ID <= second.Items[0].ID {
		t.Fatalf("cursor order is not descending: first=%+v second=%+v", first, second)
	}
}
