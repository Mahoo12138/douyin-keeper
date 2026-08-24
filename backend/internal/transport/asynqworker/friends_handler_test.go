package asynqworker

import (
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

func TestNormalizeFriendItems(t *testing.T) {
	platformID := " platform-user-1 "
	items, seen, seenConversations, err := normalizeFriendItems([]friendsListItem{
		{
			PlatformUserID: &platformID, IdentityStatus: "resolved", DisplayName: "A",
			StreakDays: 3, Conversation: &struct {
				PlatformConversationID string `json:"platform_conversation_id"`
				Channel                string `json:"channel"`
			}{PlatformConversationID: "conversation-1", Channel: "consumer"},
		},
		{IdentityStatus: "pending", DisplayName: "Unknown"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || len(seen) != 1 || seen[0] != "platform-user-1" || len(seenConversations) != 1 || seenConversations[0] != "conversation-1" {
		t.Fatalf("unexpected normalized result: items=%+v seen=%v conversations=%v", items, seen, seenConversations)
	}
	if items[0].PlatformUserID == nil || *items[0].PlatformUserID != "platform-user-1" || items[0].Conversation == nil {
		t.Fatalf("stable identity was not normalized: %+v", items[0])
	}
	if items[1].IdentityStatus != friend.IdentityPending {
		t.Fatalf("pending identity status = %q", items[1].IdentityStatus)
	}
}

func TestNormalizeFriendItemsRejectsDuplicateOrInvalidData(t *testing.T) {
	first, second := "same", "same"
	if _, _, _, err := normalizeFriendItems([]friendsListItem{{PlatformUserID: &first}, {PlatformUserID: &second}}); err == nil {
		t.Fatal("expected duplicate platform id to fail")
	}
	if _, _, _, err := normalizeFriendItems([]friendsListItem{{StreakDays: -1}}); err == nil {
		t.Fatal("expected negative streak to fail")
	}
}

func TestMapFriendsSidecarErrors(t *testing.T) {
	tests := map[string]string{
		sidecar.ErrSessionExpired:         apperr.CodeSessionExpired,
		sidecar.ErrChallengeRequired:      apperr.CodeChallengeRequired,
		sidecar.ErrPlatformRateLimited:    apperr.CodePlatformRateLimited,
		sidecar.ErrBrowserSelectorChanged: apperr.CodeBrowserSelectorChanged,
	}
	for input, want := range tests {
		if got := mapFriendsSidecarError(input); got != want {
			t.Errorf("mapFriendsSidecarError(%q) = %q, want %q", input, got, want)
		}
	}
}
