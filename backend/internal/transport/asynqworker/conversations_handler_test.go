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
		DisplayName: "对端", Channel: "consumer", LastMessageAt: &stamp,
	}}, seen)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].PlatformConversationID != "conversation-1" || items[0].PlatformUserID != "peer-1" {
		t.Fatalf("normalized item = %+v", items)
	}
	if items[0].LastMessageAt == nil || !items[0].LastMessageAt.Equal(time.Date(2026, 8, 25, 10, 11, 12, 123000000, time.UTC)) {
		t.Fatalf("last message time = %+v", items[0].LastMessageAt)
	}
}

func TestNormalizeConversationItemsRejectsUnsafePages(t *testing.T) {
	seen := map[string]struct{}{"conversation-1": {}}
	if _, err := normalizeConversationItems([]conversationListItem{{
		PlatformConversationID: "conversation-1", PlatformUserID: "peer-1", Channel: "consumer",
	}}, seen); err == nil {
		t.Fatal("duplicate conversation id should fail closed")
	}
	invalid := "not-a-timestamp"
	if _, err := normalizeConversationItems([]conversationListItem{{
		PlatformConversationID: "conversation-2", PlatformUserID: "peer-2", Channel: "consumer", LastMessageAt: &invalid,
	}}, map[string]struct{}{}); err == nil {
		t.Fatal("invalid timestamp should fail closed")
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

	if err := commitConversationSyncSuccess(context.Background(), bindTxStub{}, j, repo, claimed, 42, nil, now); err != nil {
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
