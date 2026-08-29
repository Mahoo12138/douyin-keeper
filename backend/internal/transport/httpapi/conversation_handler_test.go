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
	activatedToday := true
	friendID := uuid.New()
	view := conversationView(&conversation.Conversation{
		ID: uuid.New(), FriendID: &friendID, FriendDisplayName: "Jasmine", FriendNickname: "小雅",
		StreakActivatedToday:   &activatedToday,
		PlatformIdentityStatus: "resolved", LastMessageAt: &now, LastSyncedAt: &now, ArchivedAt: &now,
	})
	if view.FriendDisplayName != "Jasmine" || view.StreakActivatedToday == nil || !*view.StreakActivatedToday || view.LastMessageAt == nil || !view.Archived || view.ArchivedAt == nil {
		t.Fatalf("conversation view = %+v", view)
	}
}

func TestConversationIncludeArchivedParsesBoolean(t *testing.T) {
	if included, err := conversationIncludeArchived(httptest.NewRequest("GET", "/?include_archived=true", nil)); err != nil || !included {
		t.Fatalf("include_archived = %v, err=%v", included, err)
	}
	if included, err := conversationIncludeArchived(httptest.NewRequest("GET", "/", nil)); err != nil || included {
		t.Fatalf("default include_archived = %v, err=%v", included, err)
	}
	if _, err := conversationIncludeArchived(httptest.NewRequest("GET", "/?include_archived=maybe", nil)); err == nil {
		t.Fatal("invalid include_archived should be rejected")
	}
}

func TestConversationGroupOnlyParsesBoolean(t *testing.T) {
	if enabled, err := conversationGroupOnly(httptest.NewRequest("GET", "/?group_only=true", nil)); err != nil || !enabled {
		t.Fatalf("group_only = %v, err=%v", enabled, err)
	}
	if enabled, err := conversationGroupOnly(httptest.NewRequest("GET", "/", nil)); err != nil || enabled {
		t.Fatalf("default group_only = %v, err=%v", enabled, err)
	}
	if _, err := conversationGroupOnly(httptest.NewRequest("GET", "/?group_only=maybe", nil)); err == nil {
		t.Fatal("invalid group_only should be rejected")
	}
}

func TestConversationLimitRejectsOutOfRangeValues(t *testing.T) {
	if got, err := conversationLimit(httptest.NewRequest("GET", "/", nil)); err != nil || got != 50 {
		t.Fatalf("default limit = %d, err=%v", got, err)
	}
	if got, err := conversationLimit(httptest.NewRequest("GET", "/?limit=25", nil)); err != nil || got != 25 {
		t.Fatalf("limit = %d, err=%v", got, err)
	}
	for _, value := range []string{"nope", "0", "101"} {
		if _, err := conversationLimit(httptest.NewRequest("GET", "/?limit="+value, nil)); err == nil {
			t.Fatalf("limit %q should be rejected", value)
		}
	}
}

func TestConversationCursorRoundTripsInternalID(t *testing.T) {
	request := httptest.NewRequest("GET", "/?cursor="+encodeConversationCursor(42), nil)
	if got, err := conversationCursor(request); err != nil || got != 42 {
		t.Fatalf("cursor = %d, err=%v", got, err)
	}
	for _, value := range []string{"!", "MA", "MA=="} {
		if _, err := conversationCursor(httptest.NewRequest("GET", "/?cursor="+value, nil)); err == nil {
			t.Fatalf("cursor %q should be rejected", value)
		}
	}
}
