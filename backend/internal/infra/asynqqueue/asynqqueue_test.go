package asynqqueue

import "testing"

func TestConversationArchiveRunsOnBrowserQueue(t *testing.T) {
	if got := QueueFor(KindConversationArchive); got != QueueBrowser {
		t.Fatalf("conversation archive queue = %q, want %q", got, QueueBrowser)
	}
}
