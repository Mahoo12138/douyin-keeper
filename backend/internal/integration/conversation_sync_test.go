package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/conversation"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
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
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return friends.SyncBatch(tctx, acct.ID, []friend.SyncItem{{
			PlatformUserID: &platformUserID, IdentityStatus: friend.IdentityResolved, DisplayName: "初始昵称",
		}}, []string{platformUserID}, nil, time.Now().UTC())
	}); err != nil {
		t.Fatal(err)
	}
	messageAt := time.Now().UTC().Truncate(time.Microsecond)
	syncAt := messageAt.Add(time.Minute)
	streakDays := 27
	item := conversation.SyncItem{
		PlatformConversationID: platformConversationID,
		PlatformUserID:         platformUserID,
		DisplayName:            "初始昵称",
		Channel:                "consumer",
		LastMessageAt:          &messageAt,
		StreakDays:             &streakDays,
	}
	duplicate := item
	duplicate.PlatformConversationID = "conversation-sync-duplicate-" + uuid.NewString()
	duplicate.DisplayName = ""
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return conversations.SyncBatch(tctx, acct.ID, []conversation.SyncItem{item, duplicate}, syncAt)
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

	// Every direct conversation is materialized from the message-panel
	// snapshot so task/send routing never depends on a separate friend crawl.
	unknownItem := item
	unknownItem.PlatformConversationID = "conversation-chat-only-" + uuid.NewString()
	unknownItem.PlatformUserID = "chat-only-" + uuid.NewString()
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return conversations.SyncBatch(tctx, acct.ID, []conversation.SyncItem{unknownItem}, syncAt)
	}); err != nil {
		t.Fatal(err)
	}
	if items, err := friends.ListByAccountOwned(ctx, userID, acct.PublicID); err != nil || len(items) != 2 {
		t.Fatalf("direct conversation should create a friend projection: err=%v friends=%+v", err, items)
	}

	groupItem := conversation.SyncItem{
		PlatformConversationID: "0:2:" + uuid.NewString(),
		DisplayName:            "测试群聊",
		Channel:                "consumer",
		ConversationType:       "group",
	}
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return conversations.SyncBatch(tctx, acct.ID, []conversation.SyncItem{groupItem}, syncAt)
	}); err != nil {
		t.Fatal(err)
	}
	staleGroup := groupItem
	staleGroup.PlatformConversationID = "0:2:stale-" + uuid.NewString()
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return conversations.SyncBatch(tctx, acct.ID, []conversation.SyncItem{staleGroup}, syncAt)
	}); err != nil {
		t.Fatal(err)
	}
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return conversations.ReplaceGroupBatch(tctx, acct.ID, []conversation.SyncItem{groupItem}, syncAt.Add(time.Second))
	}); err != nil {
		t.Fatal(err)
	}

	item.DisplayName = "更新昵称"
	item.LastMessageAt = nil
	item.StreakDays = nil
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return conversations.SyncBatch(tctx, acct.ID, []conversation.SyncItem{item}, syncAt.Add(time.Minute))
	}); err != nil {
		t.Fatal(err)
	}

	items, err := conversations.ListByAccountOwned(ctx, userID, acct.PublicID, conversation.ListFilter{Limit: 10, IncludeArchived: true})
	if err != nil || len(items) != 4 {
		t.Fatalf("conversation sync list: err=%v items=%+v", err, items)
	}
	var refreshed, group *conversation.Conversation
	directCount := 0
	updatedDirect := false
	for _, item := range items {
		switch {
		case item.ConversationType == "group":
			group = item
		default:
			directCount++
			if item.FriendDisplayName == "更新昵称" && item.LastMessageAt != nil {
				updatedDirect = true
			}
			refreshed = item
		}
	}
	if directCount != 3 || !updatedDirect || refreshed == nil || refreshed.FriendID == nil || refreshed.LastSyncedAt == nil {
		t.Fatalf("conversation snapshot was not refreshed: %+v", refreshed)
	}
	if group == nil || !group.SparkSupported || group.FriendID == nil {
		t.Fatalf("group conversation should be retained and spark-enabled: %+v", group)
	}
	groupItems, err := conversations.ListByAccountOwned(ctx, userID, acct.PublicID, conversation.ListFilter{Limit: 10, IncludeArchived: true, GroupOnly: true})
	if err != nil || len(groupItems) != 1 || groupItems[0].ConversationType != "group" {
		t.Fatalf("group-only conversation projection = %+v, err=%v", groupItems, err)
	}
	refreshedFriends, err := friends.ListByAccountOwned(ctx, userID, acct.PublicID)
	if err != nil || len(refreshedFriends) != 4 {
		t.Fatalf("conversation sync should preserve direct projections: err=%v friends=%+v", err, refreshedFriends)
	}
	var sparkPreserved, streakPreserved bool
	for _, candidate := range refreshedFriends {
		if candidate.PlatformUserID != nil && *candidate.PlatformUserID == platformUserID && candidate.SparkEnabled {
			sparkPreserved = true
			streakPreserved = candidate.StreakDays == 27
		}
	}
	if !sparkPreserved {
		t.Fatalf("conversation sync should preserve spark state: friends=%+v", refreshedFriends)
	}
	if !streakPreserved {
		t.Fatalf("conversation sync should preserve known streak days when a later scan has no value: friends=%+v", refreshedFriends)
	}

	if _, err := conversations.SetArchived(ctx, userID, acct.PublicID, refreshed.ID, true, time.Now()); err != nil {
		t.Fatal(err)
	}
	if visible, err := conversations.ListByAccountOwned(ctx, userID, acct.PublicID, conversation.ListFilter{Limit: 10}); err != nil || len(visible) != 3 {
		t.Fatalf("archived conversation should remain hidden: err=%v items=%+v", err, visible)
	}
}
