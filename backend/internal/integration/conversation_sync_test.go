package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/conversation"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestConversationSyncIsIdempotentAndPreservesLocalState(t *testing.T) {
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

	conversations := postgres.NewConversationRepo(pool)
	friends := postgres.NewFriendRepo(pool)
	tx := postgres.NewTxManager(pool)
	platformConversationID := "conversation-sync-" + uuid.NewString()
	platformUserID := "conversation-peer-" + uuid.NewString()
	messageAt := time.Now().UTC().Truncate(time.Microsecond)
	syncAt := messageAt.Add(time.Minute)
	item := conversation.SyncItem{
		PlatformConversationID: platformConversationID,
		PlatformUserID:         platformUserID,
		DisplayName:            "初始昵称",
		Channel:                "consumer",
		LastMessageAt:          &messageAt,
	}
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return conversations.SyncBatch(tctx, acct.ID, []conversation.SyncItem{item}, syncAt)
	}); err != nil {
		t.Fatal(err)
	}

	friendItems, err := friends.ListByAccountOwned(ctx, userID, acct.PublicID)
	if err != nil || len(friendItems) != 1 {
		t.Fatalf("conversation sync friend projection: err=%v items=%+v", err, friendItems)
	}
	if err := friends.UpdateSparkEnabled(ctx, friendItems[0].ID, true); err != nil {
		t.Fatal(err)
	}

	item.DisplayName = "更新昵称"
	item.LastMessageAt = nil
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return conversations.SyncBatch(tctx, acct.ID, []conversation.SyncItem{item}, syncAt.Add(time.Minute))
	}); err != nil {
		t.Fatal(err)
	}

	items, err := conversations.ListByAccountOwned(ctx, userID, acct.PublicID, conversation.ListFilter{Limit: 10, IncludeArchived: true})
	if err != nil || len(items) != 1 {
		t.Fatalf("conversation sync list: err=%v items=%+v", err, items)
	}
	if items[0].FriendDisplayName != "更新昵称" || items[0].LastMessageAt == nil || items[0].LastSyncedAt == nil {
		t.Fatalf("conversation snapshot was not refreshed: %+v", items[0])
	}
	refreshedFriends, err := friends.ListByAccountOwned(ctx, userID, acct.PublicID)
	if err != nil || len(refreshedFriends) != 1 || !refreshedFriends[0].SparkEnabled {
		t.Fatalf("conversation sync should preserve spark state: err=%v friends=%+v", err, refreshedFriends)
	}

	if _, err := conversations.SetArchived(ctx, userID, acct.PublicID, items[0].ID, true, time.Now()); err != nil {
		t.Fatal(err)
	}
	if visible, err := conversations.ListByAccountOwned(ctx, userID, acct.PublicID, conversation.ListFilter{Limit: 10}); err != nil || len(visible) != 0 {
		t.Fatalf("archived conversation should remain hidden: err=%v items=%+v", err, visible)
	}
}
