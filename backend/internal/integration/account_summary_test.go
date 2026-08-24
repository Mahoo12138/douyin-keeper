package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAccountListSummaryCountsOwnedOperationalData(t *testing.T) {
	ctx := context.Background()
	ownerID := newUser(t)
	now := time.Now().UTC()
	accounts := postgres.NewAccountRepo(pool)
	item := &account.Account{
		PublicID: uuid.New(), UserID: ownerID, Nickname: "摘要账号",
		BindingStatus: account.BindingBound, SessionStatus: account.SessionValid,
		RiskStatus: account.RiskNormal, CreatedAt: now, UpdatedAt: now,
	}
	if err := accounts.Create(ctx, item); err != nil {
		t.Fatal(err)
	}

	friendIDs := make([]int64, 0, 2)
	for _, name := range []string{"好友一", "好友二"} {
		var id int64
		if err := pool.QueryRow(ctx, `
			INSERT INTO friends (public_id, account_id, platform_user_id, identity_status, display_name, nickname)
			VALUES ($1,$2,$3,'resolved',$4,$4) RETURNING id`, uuid.New(), item.ID, "summary-"+uuid.NewString(), name).Scan(&id); err != nil {
			t.Fatal(err)
		}
		friendIDs = append(friendIDs, id)
	}
	var enabledTaskID int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO spark_tasks (public_id, user_id, account_id, friend_id, enabled, window_start, window_end, message_kind, message_body)
		VALUES ($1,$2,$3,$4,true,'19:00','20:00','text','摘要测试') RETURNING id`, uuid.New(), ownerID, item.ID, friendIDs[0]).Scan(&enabledTaskID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO spark_tasks (public_id, user_id, account_id, friend_id, enabled, window_start, window_end, message_kind, message_body)
		VALUES ($1,$2,$3,$4,false,'19:00','20:00','text','停用任务')`, uuid.New(), ownerID, item.ID, friendIDs[1]); err != nil {
		t.Fatal(err)
	}
	localDate := now.In(time.FixedZone("Asia/Shanghai", 8*60*60)).Format("2006-01-02")
	if _, err := pool.Exec(ctx, `
		INSERT INTO send_intents (public_id, intent_type, task_id, account_id, friend_id, local_date, scheduled_at, status)
		VALUES ($1,'scheduled',$2,$3,$4,$5::date,$6,'succeeded')`, uuid.New(), enabledTaskID, item.ID, friendIDs[0], localDate, now); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO send_intents (public_id, intent_type, request_id, account_id, friend_id, scheduled_at, status)
		VALUES ($1,'manual',$2,$3,$4,$5,'failed')`, uuid.New(), uuid.New(), item.ID, friendIDs[1], now); err != nil {
		t.Fatal(err)
	}

	summaries, err := accounts.ListOwnedSummary(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) != 1 {
		t.Fatalf("summaries = %+v", summaries)
	}
	summary := summaries[0]
	if summary.FriendCount != 2 || summary.EnabledTaskCount != 1 || summary.TodaySendSucceeded != 1 || summary.TodaySendFailed != 1 {
		t.Fatalf("summary counters = %+v", summary)
	}
}
