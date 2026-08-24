package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

func TestSendJobClaimAndFinishPreserveTargetState(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	accounts := postgres.NewAccountRepo(pool)
	acct := &account.Account{
		PublicID: uuid.New(), UserID: userID, BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := accounts.Create(ctx, acct); err != nil {
		t.Fatal(err)
	}
	friends := postgres.NewFriendRepo(pool)
	platformID := "send-platform-" + uuid.NewString()
	conversationID := "send-conversation-" + uuid.NewString()
	when := time.Now().UTC().Truncate(time.Microsecond)
	if err := postgres.NewTxManager(pool).WithinTx(ctx, func(tctx context.Context) error {
		return friends.SyncBatch(tctx, acct.ID, []friend.SyncItem{{
			PlatformUserID: &platformID, IdentityStatus: friend.IdentityResolved,
			DisplayName: "Send Target", HasConversation: true,
			Conversation: &friend.ConversationSnapshot{PlatformConversationID: conversationID, Channel: "consumer"},
		}}, []string{platformID}, []string{conversationID}, when)
	}); err != nil {
		t.Fatal(err)
	}
	list, err := friends.ListByAccountOwned(ctx, userID, acct.PublicID)
	if err != nil || len(list) != 1 {
		t.Fatalf("friend setup: err=%v list=%+v", err, list)
	}
	tasks := postgres.NewTaskRepo(pool)
	body := "hello from integration"
	tk := &task.SparkTask{
		PublicID: uuid.New(), UserID: userID, AccountID: acct.ID, FriendID: list[0].ID,
		Enabled: true, Timezone: "Asia/Shanghai", WindowStart: "09:00:00", WindowEnd: "18:00:00",
		MessageKind: "text", MessageBody: &body, CreatedAt: when, UpdatedAt: when,
	}
	if err := tasks.Create(ctx, tk); err != nil {
		t.Fatal(err)
	}
	sends := postgres.NewSendRepo(pool)
	requestID := uuid.New()
	in := &send.SendIntent{
		PublicID: uuid.New(), IntentType: send.IntentManual, RequestID: &requestID,
		TaskID: &tk.ID, AccountID: acct.ID, FriendID: list[0].ID,
		ScheduledAt: when, Status: send.IntentQueued, CreatedAt: when, UpdatedAt: when,
	}
	if err := sends.CreateIntent(ctx, in); err != nil {
		t.Fatal(err)
	}
	adapter := capability.AdapterBrowserConsumer
	j := &send.SendJob{PublicID: uuid.New(), IntentID: in.ID, AccountID: acct.ID, FriendID: list[0].ID, Attempt: 1,
		SelectedAdapter: &adapter, Status: send.JobQueued, CreatedAt: when}
	if err := sends.CreateJob(ctx, j); err != nil {
		t.Fatal(err)
	}
	claimed, err := sends.ClaimJob(ctx, j.PublicID, "send-integration-worker", time.Minute)
	if err != nil || claimed == nil || claimed.Status != send.JobRunning {
		t.Fatalf("claim failed: err=%v job=%+v", err, claimed)
	}
	if duplicate, err := sends.ClaimJob(ctx, j.PublicID, "duplicate-worker", time.Minute); err != nil || duplicate != nil {
		t.Fatalf("duplicate claim should be absorbed: err=%v job=%+v", err, duplicate)
	}
	messageID := "platform-message-1"
	if err := postgres.NewTxManager(pool).WithinTx(ctx, func(tctx context.Context) error {
		if err := sends.FinishJob(tctx, j.ID, send.JobSucceeded, nil, false, &messageID, when.Add(time.Second)); err != nil {
			return err
		}
		return sends.SetIntentStatus(tctx, in.ID, send.IntentSucceeded, nil, nil, when.Add(time.Second))
	}); err != nil {
		t.Fatal(err)
	}
	finished, err := sends.GetJobByPublicID(ctx, j.PublicID)
	if err != nil || finished.Status != send.JobSucceeded || finished.PlatformMessageID == nil || *finished.PlatformMessageID != messageID ||
		finished.SelectedAdapter == nil || *finished.SelectedAdapter != adapter {
		t.Fatalf("finished job mismatch: err=%v job=%+v", err, finished)
	}
	intent, err := sends.GetIntentByPublicID(ctx, in.PublicID)
	if err != nil || intent.Status != send.IntentSucceeded {
		t.Fatalf("finished intent mismatch: err=%v intent=%+v", err, intent)
	}
	target, err := friends.GetSendTarget(ctx, acct.ID, list[0].ID)
	if err != nil || target.PlatformUserID != platformID || target.PlatformConversationID != conversationID {
		t.Fatalf("send target mismatch: err=%v target=%+v", err, target)
	}
}
