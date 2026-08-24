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

func TestConversationListCursorPageIsStableAndScoped(t *testing.T) {
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
	platformIDs := make([]string, 0, 3)
	conversationIDs := make([]string, 0, 3)
	items := make([]friend.SyncItem, 0, 3)
	for index := 0; index < 3; index++ {
		platformID := "conversation-page-user-" + uuid.NewString()
		conversationID := "conversation-page-" + uuid.NewString()
		platformIDs = append(platformIDs, platformID)
		conversationIDs = append(conversationIDs, conversationID)
		items = append(items, friend.SyncItem{
			PlatformUserID: &platformIDs[index], IdentityStatus: friend.IdentityResolved,
			DisplayName: "分页会话", Nickname: "分页会话",
			Conversation: &friend.ConversationSnapshot{PlatformConversationID: conversationID, Channel: "consumer"},
		})
	}
	if err := postgres.NewFriendRepo(pool).SyncBatch(ctx, acct.ID, items, platformIDs, conversationIDs, time.Now()); err != nil {
		t.Fatal(err)
	}

	service := conversation.NewService(postgres.NewConversationRepo(pool))
	first, err := service.ListPageForAccount(ctx, userID, acct.PublicID, conversation.ListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListPageForAccount(ctx, userID, acct.PublicID, conversation.ListFilter{Limit: 2, AfterID: first.NextAfterID})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) != 1 || second.NextAfterID != 0 {
		t.Fatalf("second page = %+v", second)
	}
	if first.Items[1].InternalID <= second.Items[0].InternalID {
		t.Fatalf("cursor order is not descending: first=%+v second=%+v", first, second)
	}
}
