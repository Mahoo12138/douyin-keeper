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

func TestFriendSyncIsIdempotentAndPreservesUserState(t *testing.T) {
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
	tx := postgres.NewTxManager(pool)
	platformOne, platformTwo := "sync-platform-one", "sync-platform-two"
	syncAt := time.Now().UTC().Truncate(time.Microsecond)
	first := []friend.SyncItem{
		{PlatformUserID: &platformOne, IdentityStatus: friend.IdentityResolved, DisplayName: "One", StreakDays: 1},
		{PlatformUserID: &platformTwo, IdentityStatus: friend.IdentityResolved, DisplayName: "Two", StreakDays: 2},
	}
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return friends.SyncBatch(tctx, acct.ID, first, []string{platformOne, platformTwo}, nil, syncAt)
	}); err != nil {
		t.Fatal(err)
	}
	list, err := friends.ListByAccountOwned(ctx, userID, acct.PublicID)
	if err != nil || len(list) != 2 {
		t.Fatalf("first sync list: err=%v list=%+v", err, list)
	}
	var twoPublicID uuid.UUID
	var oneID int64
	for _, item := range list {
		if item.PlatformUserID != nil && *item.PlatformUserID == platformOne {
			oneID = item.ID
		}
		if item.PlatformUserID != nil && *item.PlatformUserID == platformTwo {
			twoPublicID = item.PublicID
		}
	}
	if twoPublicID == uuid.Nil {
		t.Fatal("second friend was not created")
	}
	if oneID == 0 {
		t.Fatal("first friend was not created")
	}
	if err := friends.UpdateSparkEnabled(ctx, oneID, true); err != nil {
		t.Fatal(err)
	}
	conversationID := "conversation-pending-1"
	second := []friend.SyncItem{
		{PlatformUserID: &platformOne, IdentityStatus: friend.IdentityResolved, DisplayName: "One renamed", StreakDays: 4},
		{IdentityStatus: friend.IdentityPending, DisplayName: "Unknown", Conversation: &friend.ConversationSnapshot{
			PlatformConversationID: conversationID,
		}},
	}
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return friends.SyncBatch(tctx, acct.ID, second, []string{platformOne}, []string{conversationID}, syncAt.Add(time.Minute))
	}); err != nil {
		t.Fatal(err)
	}
	list, err = friends.ListByAccountOwned(ctx, userID, acct.PublicID)
	if err != nil || len(list) != 2 {
		t.Fatalf("second sync list: err=%v list=%+v", err, list)
	}
	var foundOne, foundPending bool
	for _, item := range list {
		if item.PlatformUserID != nil && *item.PlatformUserID == platformOne {
			foundOne = true
			if !item.SparkEnabled || item.DisplayName != "One renamed" {
				t.Fatalf("user state was not preserved/refreshed: %+v", item)
			}
		}
		if item.PlatformUserID == nil && item.HasConversation {
			foundPending = true
		}
	}
	if !foundOne || !foundPending {
		for _, item := range list {
			t.Logf("friend: id=%d platform=%v status=%s name=%q conversation=%t", item.ID, item.PlatformUserID, item.IdentityStatus, item.DisplayName, item.HasConversation)
		}
		t.Fatalf("expected resolved and pending friends: foundOne=%t foundPending=%t", foundOne, foundPending)
	}

	third := []friend.SyncItem{{PlatformUserID: &platformTwo, IdentityStatus: friend.IdentityResolved, DisplayName: "Two back"}}
	if err := tx.WithinTx(ctx, func(tctx context.Context) error {
		return friends.SyncBatch(tctx, acct.ID, third, []string{platformTwo}, nil, syncAt.Add(2*time.Minute))
	}); err != nil {
		t.Fatal(err)
	}
	list, err = friends.ListByAccountOwned(ctx, userID, acct.PublicID)
	if err != nil || len(list) != 1 || list[0].PublicID != twoPublicID {
		t.Fatalf("soft-delete/revive behavior incorrect: err=%v list=%+v", err, list)
	}
}
