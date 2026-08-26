package conversation

import (
	"context"
	"encoding/json"
	"fmt"
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
	created  *job.Job
	existing *job.Job
}

func (s *platformArchiveJobStub) CreateJob(_ context.Context, item *job.Job) error {
	copy := *item
	s.created = &copy
	return nil
}

func (s *platformArchiveJobStub) GetByIdempotency(context.Context, int64, string) (*job.Job, error) {
	return s.existing, nil
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

	key := uuid.New().String()
	jobID, err := svc.Request(context.Background(), 11, accountPublicID, conversationPublicID, true, key)
	if err != nil {
		t.Fatal(err)
	}
	if jobID == uuid.Nil || repo.calls != 1 || tx.calls != 1 || jobs.created == nil || len(relay.messages) != 1 {
		t.Fatalf("request did not persist the durable handoff: job=%s repo_calls=%d tx_calls=%d created=%+v messages=%d", jobID, repo.calls, tx.calls, jobs.created, len(relay.messages))
	}
	if jobs.created.PublicID != jobID || jobs.created.Type != outbox.KindConversationArchive || jobs.created.Status != job.StatusQueued || jobs.created.AccountID == nil || *jobs.created.AccountID != 7 {
		t.Fatalf("unexpected job row: %+v", jobs.created)
	}
	if jobs.created.IdempotencyKey == nil || *jobs.created.IdempotencyKey != key || jobs.created.IdempotencyScope == nil {
		t.Fatalf("idempotency metadata was not persisted: %+v", jobs.created)
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
	_, err := svc.Request(context.Background(), 11, uuid.New(), uuid.New(), true, uuid.New().String())
	if err == nil {
		t.Fatal("expected missing platform target to fail")
	}
	if tx.calls != 0 {
		t.Fatalf("transaction should not start for a missing platform target: %d", tx.calls)
	}
}

func TestPlatformArchiveRequestReplaysExistingJobForSameIdempotencyKey(t *testing.T) {
	accountPublicID, conversationPublicID, key := uuid.New(), uuid.New(), uuid.New().String()
	scope := fmt.Sprintf("conversation.archive.browser:%s:%s:%t", accountPublicID, conversationPublicID, true)
	repo := &platformArchiveRepoStub{target: &PlatformArchiveTarget{ConversationID: 42, AccountID: 7, UserID: 11, PlatformConversationID: "conversation-1"}}
	existing := &job.Job{PublicID: uuid.New(), IdempotencyScope: &scope}
	jobs := &platformArchiveJobStub{existing: existing}
	tx, relay := &platformArchiveTxStub{}, &platformArchiveOutboxStub{}
	svc := NewPlatformArchiveService(repo, tx, jobs, relay)
	got, err := svc.Request(context.Background(), 11, accountPublicID, conversationPublicID, true, key)
	if err != nil || got != existing.PublicID {
		t.Fatalf("same idempotency key should replay the original job: got=%s err=%v", got, err)
	}
	if repo.calls != 0 || tx.calls != 0 || jobs.created != nil || len(relay.messages) != 0 {
		t.Fatalf("replay should not create a second durable handoff: repo=%d tx=%d job=%+v outbox=%d", repo.calls, tx.calls, jobs.created, len(relay.messages))
	}
}
