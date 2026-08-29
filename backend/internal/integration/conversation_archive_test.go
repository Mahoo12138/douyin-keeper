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

func TestConversationArchiveIsScopedReversibleAndHiddenByDefault(t *testing.T) {
	ctx := context.Background()
	ownerID := newUser(t)
	otherUserID := newUser(t)
	accounts := postgres.NewAccountRepo(pool)
	acct := &account.Account{
		PublicID: uuid.New(), UserID: ownerID, BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := accounts.Create(ctx, acct); err != nil {
		t.Fatal(err)
	}
	platformID := "archive-platform-" + uuid.NewString()
	conversationID := "archive-conversation-" + uuid.NewString()
	friends := postgres.NewFriendRepo(pool)
	if err := friends.SyncBatch(ctx, acct.ID, []friend.SyncItem{{
		PlatformUserID: &platformID, IdentityStatus: friend.IdentityResolved, DisplayName: "归档好友",
		Conversation: &friend.ConversationSnapshot{PlatformConversationID: conversationID},
	}}, []string{platformID}, []string{conversationID}, time.Now()); err != nil {
		t.Fatal(err)
	}

	conversations := postgres.NewConversationRepo(pool)
	items, err := conversations.ListByAccountOwned(ctx, ownerID, acct.PublicID, conversation.ListFilter{Limit: 10})
	if err != nil || len(items) != 1 || items[0].ArchivedAt != nil {
		t.Fatalf("active conversations = %+v, err=%v", items, err)
	}
	conversationPublicID := items[0].ID
	target, err := conversations.GetPlatformArchiveTargetOwned(ctx, ownerID, acct.PublicID, conversationPublicID)
	if err != nil || target == nil || target.AccountID != acct.ID || target.PlatformConversationID != conversationID || target.PlatformUserID == nil || *target.PlatformUserID != platformID {
		t.Fatalf("platform archive target = %+v, err=%v", target, err)
	}
	updated, err := conversations.SetArchived(ctx, ownerID, acct.PublicID, conversationPublicID, true, time.Now())
	if err != nil || updated.ArchivedAt == nil {
		t.Fatalf("archive conversation = %+v, err=%v", updated, err)
	}
	if _, err := conversations.SetArchived(ctx, otherUserID, acct.PublicID, conversationPublicID, false, time.Now()); err == nil {
		t.Fatal("cross-user archive should be rejected")
	}
	items, err = conversations.ListByAccountOwned(ctx, ownerID, acct.PublicID, conversation.ListFilter{Limit: 10})
	if err != nil || len(items) != 0 {
		t.Fatalf("archived conversation should be hidden: items=%+v err=%v", items, err)
	}
	items, err = conversations.ListByAccountOwned(ctx, ownerID, acct.PublicID, conversation.ListFilter{Limit: 10, IncludeArchived: true})
	if err != nil || len(items) != 1 || items[0].ArchivedAt == nil {
		t.Fatalf("include archived = %+v, err=%v", items, err)
	}
	updated, err = conversations.SetArchived(ctx, ownerID, acct.PublicID, conversationPublicID, false, time.Now())
	if err != nil || updated.ArchivedAt != nil {
		t.Fatalf("restore conversation = %+v, err=%v", updated, err)
	}
}
