package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

func TestJobEventAppendIsConcurrentAndKeepsReplayOrder(t *testing.T) {
	ctx := context.Background()
	repo := postgres.NewJobRepo(pool)
	created := time.Now().UTC().Truncate(time.Microsecond)
	item := &job.Job{PublicID: uuid.New(), Type: "account.session_check.browser", Status: job.StatusQueued, CreatedAt: created}
	if err := repo.CreateJob(ctx, item); err != nil {
		t.Fatal(err)
	}

	const writes = 24
	results := make(chan error, writes)
	var wg sync.WaitGroup
	for index := 0; index < writes; index++ {
		index := index
		wg.Add(1)
		go func() {
			defer wg.Done()
			payload, _ := json.Marshal(map[string]int{"index": index})
			results <- repo.AppendEvent(ctx, item.ID, job.JobEvent{
				EventType: fmt.Sprintf("progress_%02d", index), Payload: payload, CreatedAt: created,
			})
		}()
	}
	wg.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatalf("concurrent AppendEvent failed: %v", err)
		}
	}

	events, err := repo.ListEvents(ctx, item.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != writes {
		t.Fatalf("event count = %d, want %d", len(events), writes)
	}
	seen := make(map[string]struct{}, writes)
	for index, event := range events {
		if event.Seq != int64(index+1) {
			t.Fatalf("event seq at index %d = %d, want %d", index, event.Seq, index+1)
		}
		seen[event.EventType] = struct{}{}
	}
	if len(seen) != writes {
		t.Fatalf("event types = %d, want %d", len(seen), writes)
	}
}
