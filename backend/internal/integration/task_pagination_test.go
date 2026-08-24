package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

func TestTaskListCursorPageIsStableAndScoped(t *testing.T) {
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
		var friendID int64
		if err := pool.QueryRow(ctx, `
			INSERT INTO friends (public_id, account_id, platform_user_id, identity_status, display_name, nickname)
			VALUES ($1,$2,$3,'resolved',$4,$4)
			RETURNING id`, uuid.New(), acct.ID, "task-page-user-"+uuid.NewString(), "分页任务").Scan(&friendID); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO spark_tasks (public_id, user_id, account_id, friend_id, enabled, window_start, window_end, message_kind, message_body)
			VALUES ($1,$2,$3,$4,true,'19:00:00','22:00:00','text','晚安')`, uuid.New(), userID, acct.ID, friendID); err != nil {
			t.Fatal(err)
		}
	}
	otherUserID := newUser(t)
	otherAcct := &account.Account{
		PublicID: uuid.New(), UserID: otherUserID, BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := postgres.NewAccountRepo(pool).Create(ctx, otherAcct); err != nil {
		t.Fatal(err)
	}
	var otherFriendID int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO friends (public_id, account_id, platform_user_id, identity_status, display_name, nickname)
		VALUES ($1,$2,$3,'resolved',$4,$4)
		RETURNING id`, uuid.New(), otherAcct.ID, "task-page-other-user-"+uuid.NewString(), "其他用户任务").Scan(&otherFriendID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO spark_tasks (public_id, user_id, account_id, friend_id, enabled, window_start, window_end, message_kind, message_body)
		VALUES ($1,$2,$3,$4,true,'19:00:00','22:00:00','text','其他用户')`, uuid.New(), otherUserID, otherAcct.ID, otherFriendID); err != nil {
		t.Fatal(err)
	}

	service := task.NewService(postgres.NewTaskRepo(pool), nil, nil, nil, nil, nil)
	first, err := service.ListPageForUser(ctx, userID, task.ListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListPageForUser(ctx, userID, task.ListFilter{Limit: 2, AfterID: first.NextAfterID})
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
