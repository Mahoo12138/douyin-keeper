package httpapi

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/conversation"
)

func TestConversationViewKeepsPlatformIdentityOutOfResponse(t *testing.T) {
	now := time.Date(2026, 8, 24, 9, 0, 0, 0, time.UTC)
	view := conversationView(&conversation.Conversation{
		ID: uuid.New(), FriendID: uuid.New(), FriendDisplayName: "Jasmine", FriendNickname: "小雅",
		PlatformIdentityStatus: "resolved", Channel: "consumer", LastMessageAt: &now, LastSyncedAt: &now,
	})
	if view.FriendDisplayName != "Jasmine" || view.Channel != "consumer" || view.LastMessageAt == nil {
		t.Fatalf("conversation view = %+v", view)
	}
}

func TestConversationLimitRejectsOutOfRangeValues(t *testing.T) {
	if got, err := conversationLimit(httptest.NewRequest("GET", "/?limit=25", nil)); err != nil || got != 25 {
		t.Fatalf("limit = %d, err=%v", got, err)
	}
	for _, value := range []string{"nope", "0", "101"} {
		if _, err := conversationLimit(httptest.NewRequest("GET", "/?limit="+value, nil)); err == nil {
			t.Fatalf("limit %q should be rejected", value)
		}
	}
}
