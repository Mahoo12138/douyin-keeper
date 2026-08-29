package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/scheduler"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

func TestSchedulerCreatesDailyIntentAndOutboxOnce(t *testing.T) {
	ctx := context.Background()
	// Integration tests share a database for speed. Isolate this scheduler
	// scenario from prior due tasks and never leave transport rows behind for
	// the outbox test.
	if _, err := pool.Exec(ctx, `DELETE FROM queue_outbox WHERE kind = 'send.dispatch'`); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM queue_outbox WHERE kind = 'send.dispatch'`) }()
	userID := newUser(t)
	ent := newEntSvc()
	adminID := newUser(t)
	code, _ := seedCard(t, ent, adminID)
	if _, _, err := ent.Redeem(ctx, userID, code); err != nil {
		t.Fatalf("redeem: %v", err)
	}

	accounts := postgres.NewAccountRepo(pool)
	when := time.Now().UTC().Truncate(time.Microsecond)
	acct := &account.Account{
		PublicID: uuid.New(), UserID: userID, BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: when, UpdatedAt: when,
	}
	if err := accounts.Create(ctx, acct); err != nil {
		t.Fatal(err)
	}

	friends := postgres.NewFriendRepo(pool)
	platformID := "scheduler-platform-" + uuid.NewString()
	conversationID := "scheduler-conversation-" + uuid.NewString()
	if err := postgres.NewTxManager(pool).WithinTx(ctx, func(tctx context.Context) error {
		return friends.SyncBatch(tctx, acct.ID, []friend.SyncItem{{
			PlatformUserID: &platformID, IdentityStatus: friend.IdentityResolved,
			DisplayName: "Scheduler Target", HasConversation: true,
			Conversation: &friend.ConversationSnapshot{PlatformConversationID: conversationID},
		}}, []string{platformID}, []string{conversationID}, when)
	}); err != nil {
		t.Fatal(err)
	}
	list, err := friends.ListByAccountOwned(ctx, userID, acct.PublicID)
	if err != nil || len(list) != 1 {
		t.Fatalf("friend setup: err=%v list=%+v", err, list)
	}

	body := "scheduled hello"
	tk := &task.SparkTask{
		PublicID: uuid.New(), UserID: userID, AccountID: acct.ID, FriendID: list[0].ID,
		Enabled: true, Timezone: "Asia/Shanghai", WindowStart: "00:00:00", WindowEnd: "23:59:59",
		MessageKind: "text", MessageBody: &body, CreatedAt: when, UpdatedAt: when,
	}
	if err := postgres.NewTaskRepo(pool).Create(ctx, tk); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = pool.Exec(ctx, `UPDATE spark_tasks SET enabled = false WHERE id = $1`, tk.ID) }()
	if _, err := pool.Exec(ctx, `UPDATE spark_tasks SET enabled = false WHERE id <> $1`, tk.ID); err != nil {
		t.Fatal(err)
	}

	tx := postgres.NewTxManager(pool)
	sends := postgres.NewSendRepo(pool)
	relay := postgres.NewOutboxRepo(pool)
	runner := scheduler.NewTickRunner(postgres.NewTaskRepo(pool), sends, ent, ent, relay, tx, 10)
	// Keep the test deterministic even when it runs near a local-day boundary.
	runner.SetNow(func() time.Time { return when })
	pausedAt := when.Add(-time.Minute)
	if err := accounts.SetPaused(ctx, acct.ID, &pausedAt); err != nil {
		t.Fatal(err)
	}
	pausedStats, err := runner.RunOnce(ctx)
	if err != nil || pausedStats.Scanned != 0 || pausedStats.Created != 0 {
		t.Fatalf("paused account should not be scheduled: stats=%+v err=%v", pausedStats, err)
	}
	if err := accounts.SetPaused(ctx, acct.ID, nil); err != nil {
		t.Fatal(err)
	}

	stats, err := runner.RunOnce(ctx)
	if err != nil || stats.Scanned < 1 || stats.Created < 1 {
		t.Fatalf("first tick stats=%+v err=%v", stats, err)
	}

	intents, err := sends.ListIntentsByUser(ctx, userID, send.IntentListFilter{})
	if err != nil {
		t.Fatal(err)
	}
	var scheduled *send.SendIntent
	for _, in := range intents {
		if in.IntentType == send.IntentScheduled && in.TaskID != nil && *in.TaskID == tk.ID {
			scheduled = in
		}
	}
	if scheduled == nil || scheduled.Status != send.IntentQueued || scheduled.LastJobID == nil {
		t.Fatalf("scheduled intent not queued: %+v", scheduled)
	}
	stats, err = runner.RunOnce(ctx)
	if err != nil {
		t.Fatalf("duplicate tick stats=%+v err=%v", stats, err)
	}
	intents, err = sends.ListIntentsByUser(ctx, userID, send.IntentListFilter{})
	if err != nil {
		t.Fatal(err)
	}
	matching := 0
	for _, in := range intents {
		if in.IntentType == send.IntentScheduled && in.TaskID != nil && *in.TaskID == tk.ID {
			matching++
		}
	}
	if matching != 1 {
		t.Fatalf("duplicate tick created %d intents for task", matching)
	}
	count, err := sends.CountJobsForIntent(ctx, scheduled.ID)
	if err != nil || count != 1 {
		t.Fatalf("job count=%d err=%v", count, err)
	}
	var outboxCount int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM queue_outbox WHERE dedupe_key = $1`, "send.dispatch:"+scheduled.PublicID.String()).Scan(&outboxCount); err != nil {
		t.Fatal(err)
	}
	if outboxCount != 1 {
		t.Fatalf("dispatch outbox count=%d", outboxCount)
	}
	usage, err := postgres.NewEntitlementRepo(pool).GetDailyUsage(ctx, userID, entitlement.EffectiveLocalDate(when))
	if err != nil || usage == nil || usage.ReservedSendCount != 1 {
		t.Fatalf("daily usage=%+v err=%v", usage, err)
	}
}

func TestSchedulerSkipsExpiredEntitlementWithoutQueueingJob(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	adminID := newUser(t)
	ent := newEntSvc()
	code, _ := seedCard(t, ent, adminID)
	if _, _, err := ent.Redeem(ctx, userID, code); err != nil {
		t.Fatalf("redeem: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		UPDATE entitlement_grants
		SET starts_at = now() - interval '2 days', expires_at = now() - interval '1 day'
		WHERE user_id = $1 AND revoked_at IS NULL`, userID); err != nil {
		t.Fatalf("expire grant: %v", err)
	}

	acct, f := seedBoundAccountAndFriend(t, userID)
	when := time.Now().UTC().Truncate(time.Microsecond)
	body := "expired entitlement should not send"
	tk := &task.SparkTask{
		PublicID: uuid.New(), UserID: userID, AccountID: acct.ID, FriendID: f.ID,
		Enabled: true, Timezone: "Asia/Shanghai", WindowStart: "00:00:00", WindowEnd: "23:59:59",
		MessageKind: "text", MessageBody: &body, CreatedAt: when, UpdatedAt: when,
	}
	if err := postgres.NewTaskRepo(pool).Create(ctx, tk); err != nil {
		t.Fatalf("create due task: %v", err)
	}

	sends := postgres.NewSendRepo(pool)
	runner := scheduler.NewTickRunner(postgres.NewTaskRepo(pool), sends, ent, ent,
		postgres.NewOutboxRepo(pool), postgres.NewTxManager(pool), 10)
	runner.SetNow(func() time.Time { return when })
	stats, err := runner.RunOnce(ctx)
	if err != nil || stats.Scanned != 1 || stats.Created != 1 || stats.Skipped != 1 {
		t.Fatalf("expired entitlement stats=%+v err=%v", stats, err)
	}

	intents, err := sends.ListIntentsByUser(ctx, userID, send.IntentListFilter{})
	if err != nil || len(intents) != 1 {
		t.Fatalf("expired entitlement intents=%+v err=%v", intents, err)
	}
	intent := intents[0]
	if intent.Status != send.IntentSkipped || intent.ErrorCode == nil || *intent.ErrorCode != apperr.CodeEntitlementExpired {
		t.Fatalf("expired entitlement intent=%+v", intent)
	}
	if intent.LastJobID != nil {
		t.Fatalf("expired entitlement created a job: %+v", intent)
	}
	if count, err := sends.CountJobsForIntent(ctx, intent.ID); err != nil || count != 0 {
		t.Fatalf("expired entitlement job count=%d err=%v", count, err)
	}
	var outboxCount int
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM queue_outbox WHERE aggregate_id = $1`, intent.PublicID.String()).Scan(&outboxCount); err != nil {
		t.Fatalf("count expired entitlement outbox: %v", err)
	}
	if outboxCount != 0 {
		t.Fatalf("expired entitlement queued %d outbox messages", outboxCount)
	}
}
