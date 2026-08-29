package asynqworker

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/conversation"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

func TestNormalizeConversationItemsUsesStableIdentityAndTimestamp(t *testing.T) {
	stamp := "2026-08-25T10:11:12.123Z"
	seen := map[string]struct{}{}
	items, err := normalizeConversationItems([]conversationListItem{{
		PlatformConversationID: " conversation-1 ", PlatformUserID: " peer-1 ",
		DisplayName: "对端", AvatarURL: "https://p.example/avatar.jpg", LastMessageAt: &stamp,
	}}, seen)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].PlatformConversationID != "conversation-1" || items[0].PlatformUserID != "peer-1" {
		t.Fatalf("normalized item = %+v", items)
	}
	if items[0].AvatarURL != "https://p.example/avatar.jpg" {
		t.Fatalf("avatar url = %q", items[0].AvatarURL)
	}
	if items[0].LastMessageAt == nil || !items[0].LastMessageAt.Equal(time.Date(2026, 8, 25, 10, 11, 12, 123000000, time.UTC)) {
		t.Fatalf("last message time = %+v", items[0].LastMessageAt)
	}
}

func TestNormalizeConversationItemsDropsInvalidAvatarURL(t *testing.T) {
	items, err := normalizeConversationItems([]conversationListItem{{
		PlatformConversationID: "conversation-1", PlatformUserID: "peer-1",
		AvatarURL: "javascript:alert(1)",
	}}, map[string]struct{}{})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].AvatarURL != "" {
		t.Fatalf("avatar url = %q, want empty", items[0].AvatarURL)
	}
}

func TestNormalizeConversationItemsCarriesValidatedStreakDays(t *testing.T) {
	streakDays := 27
	activatedToday := true
	items, err := normalizeConversationItems([]conversationListItem{{
		PlatformConversationID: "conversation-1", PlatformUserID: "peer-1",
		StreakDays: &streakDays, StreakActivatedToday: &activatedToday,
	}}, map[string]struct{}{})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].StreakDays == nil || *items[0].StreakDays != 27 {
		t.Fatalf("streak days = %+v, want 27", items)
	}
	if items[0].StreakActivatedToday == nil || !*items[0].StreakActivatedToday {
		t.Fatalf("streak activated today = %+v, want true", items[0].StreakActivatedToday)
	}

	invalid := -1
	if _, err := normalizeConversationItems([]conversationListItem{{
		PlatformConversationID: "conversation-2", PlatformUserID: "peer-2",
		StreakDays: &invalid,
	}}, map[string]struct{}{}); err == nil {
		t.Fatal("negative streak days should fail closed")
	}
}

func TestNormalizeConversationItemsRejectsUnsafePages(t *testing.T) {
	seen := map[string]struct{}{"conversation-1": {}}
	if _, err := normalizeConversationItems([]conversationListItem{{
		PlatformConversationID: "conversation-1", PlatformUserID: "peer-1",
	}}, seen); err == nil {
		t.Fatal("duplicate conversation id should fail closed")
	}
	invalid := "not-a-timestamp"
	if _, err := normalizeConversationItems([]conversationListItem{{
		PlatformConversationID: "conversation-2", PlatformUserID: "peer-2", LastMessageAt: &invalid,
	}}, map[string]struct{}{}); err == nil {
		t.Fatal("invalid timestamp should fail closed")
	}
	if _, err := normalizeConversationItems([]conversationListItem{
		{PlatformConversationID: "conversation-3", PlatformUserID: "peer-3", ConversationType: "direct"},
		{PlatformConversationID: "conversation-4", PlatformUserID: "peer-3", ConversationType: "direct"},
	}, map[string]struct{}{}); err == nil {
		t.Fatal("duplicate direct peer identity should fail closed")
	}
}

func TestNormalizeConversationItemsRetainsGroupWithoutPeerIdentity(t *testing.T) {
	items, err := normalizeConversationItems([]conversationListItem{{
		PlatformConversationID: "0:2:group-1", DisplayName: "群聊", ConversationType: "group",
	}}, map[string]struct{}{})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ConversationType != "group" || items[0].PlatformUserID != "" {
		t.Fatalf("normalized group item = %+v", items)
	}
}

func TestFilterConversationListItemsForGroupsFailsClosed(t *testing.T) {
	items := filterConversationListItems([]conversationListItem{
		{PlatformConversationID: "direct-1", ConversationType: "direct"},
		{PlatformConversationID: "group-1", ConversationType: "group"},
		{PlatformConversationID: "unknown-1", ConversationType: "unknown"},
	}, true)
	if len(items) != 1 || items[0].ConversationType != "group" {
		t.Fatalf("group-only items = %+v, want one explicit group", items)
	}
}

func TestConversationSnapshotRejectsCurrentAccountAsDirectPeer(t *testing.T) {
	selfID := "self-sec-uid"
	items := []conversation.SyncItem{
		{PlatformConversationID: "0:1:peer", PlatformUserID: "peer-sec-uid", ConversationType: "direct"},
		{PlatformConversationID: "0:1:self", PlatformUserID: selfID, ConversationType: "direct"},
		{PlatformConversationID: "0:2:group", PlatformUserID: selfID, ConversationType: "group"},
	}
	if got := countSelfConversationPeers(items, &selfID); got != 1 {
		t.Fatalf("self peer count = %d, want 1 direct conversation", got)
	}
}

type conversationSyncStub struct{ operations []string }

func (r *conversationSyncStub) SyncBatch(ctx context.Context, _ int64, _ []conversation.SyncItem, _ time.Time) error {
	r.operations = append(r.operations, bindOperation(ctx, "conversations"))
	return nil
}

func TestCommitConversationSyncSuccessFinalizesJobBeforeSnapshot(t *testing.T) {
	j := &bindJobRepoStub{}
	repo := &conversationSyncStub{}
	now := func() time.Time { return time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC) }
	claimed := &job.Job{ID: 20, PublicID: uuid.New(), Status: job.StatusRunning}

	if err := commitConversationSyncSuccess(context.Background(), bindTxStub{}, j, repo, claimed, 42, nil, false, now); err != nil {
		t.Fatal(err)
	}
	if len(j.operations) == 0 || j.operations[0] != "tx:finish" {
		t.Fatalf("job operations = %#v, want transaction finish first", j.operations)
	}
	for _, operation := range append(j.operations, repo.operations...) {
		if len(operation) < len("tx:") || operation[:len("tx:")] != "tx:" {
			t.Fatalf("conversation sync side effect escaped completion transaction: %q", operation)
		}
	}
}
