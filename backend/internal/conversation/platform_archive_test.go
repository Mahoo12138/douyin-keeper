package conversation

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
)

type platformArchiveRepoStub struct {
	target *PlatformArchiveTarget
	calls  int
}

func (s *platformArchiveRepoStub) GetPlatformArchiveTargetOwned(context.Context, int64, uuid.UUID, uuid.UUID) (*PlatformArchiveTarget, error) {
	s.calls++
	return s.target, nil
}

type platformArchiveTxStub struct {
	calls int
}

func (s *platformArchiveTxStub) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	s.calls++
	return fn(ctx)
}

type platformArchiveJobStub struct {
	created *job.Job
}

func (s *platformArchiveJobStub) CreateJob(_ context.Context, item *job.Job) error {
	copy := *item
	s.created = &copy
	return nil
}

type platformArchiveOutboxStub struct {
	messages []outbox.Message
}

func (s *platformArchiveOutboxStub) Add(_ context.Context, message outbox.Message) error {
	s.messages = append(s.messages, message)
	return nil
}

func TestPlatformArchiveRequestCreatesDurableJobAndOutbox(t *testing.T) {
	accountPublicID := uuid.New()
	conversationPublicID := uuid.New()
	platformUserID := "platform-user-1"
	repo := &platformArchiveRepoStub{target: &PlatformArchiveTarget{
		ConversationID: 42, ConversationPublicID: conversationPublicID,
		AccountID: 7, AccountPublicID: accountPublicID, UserID: 11,
		PlatformUserID: &platformUserID, PlatformConversationID: "conversation-1",
	}}
	tx := &platformArchiveTxStub{}
	jobs := &platformArchiveJobStub{}
	relay := &platformArchiveOutboxStub{}
	svc := NewPlatformArchiveService(repo, tx, jobs, relay)
	svc.now = func() time.Time { return time.Date(2026, 8, 25, 10, 0, 0, 0, time.UTC) }

	jobID, err := svc.Request(context.Background(), 11, accountPublicID, conversationPublicID, true)
	if err != nil {
		t.Fatal(err)
	}
	if jobID == uuid.Nil || repo.calls != 1 || tx.calls != 1 || jobs.created == nil || len(relay.messages) != 1 {
		t.Fatalf("request did not persist the durable handoff: job=%s repo_calls=%d tx_calls=%d created=%+v messages=%d", jobID, repo.calls, tx.calls, jobs.created, len(relay.messages))
	}
	if jobs.created.PublicID != jobID || jobs.created.Type != outbox.KindConversationArchive || jobs.created.Status != job.StatusQueued || jobs.created.AccountID == nil || *jobs.created.AccountID != 7 {
		t.Fatalf("unexpected job row: %+v", jobs.created)
	}
	message := relay.messages[0]
	if message.Kind != outbox.KindConversationArchive || message.AggregateType != "job" || message.AggregateID != jobID.String() || message.DedupeKey != "job.platform:"+jobID.String() {
		t.Fatalf("unexpected outbox message: %+v", message)
	}
	var payload PlatformArchiveJobPayload
	if err := json.Unmarshal(message.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.JobID != jobID.String() || payload.ConversationID != 42 || payload.AccountID != 7 || payload.PlatformConversationID != "conversation-1" || !payload.Archived || payload.PlatformUserID == nil || *payload.PlatformUserID != platformUserID {
		t.Fatalf("unexpected worker payload: %+v", payload)
	}
}

func TestPlatformArchiveRequestRejectsMissingPlatformTargetBeforeTransaction(t *testing.T) {
	repo := &platformArchiveRepoStub{}
	tx := &platformArchiveTxStub{}
	svc := NewPlatformArchiveService(repo, tx, &platformArchiveJobStub{}, &platformArchiveOutboxStub{})
	_, err := svc.Request(context.Background(), 11, uuid.New(), uuid.New(), true)
	if err == nil {
		t.Fatal("expected missing platform target to fail")
	}
	if tx.calls != 0 {
		t.Fatalf("transaction should not start for a missing platform target: %d", tx.calls)
	}
}
