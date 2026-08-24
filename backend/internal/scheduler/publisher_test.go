package scheduler

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

type publisherOutboxStub struct {
	published      []int64
	failed         []publisherFailure
	claimErr       error
	markPublishErr error
}

type publisherFailure struct {
	id       int64
	attempts int
	errCode  string
}

func (s *publisherOutboxStub) ClaimPending(context.Context, int, string, time.Duration) ([]postgres.PendingMessage, error) {
	return nil, s.claimErr
}

func (s *publisherOutboxStub) MarkPublished(_ context.Context, id int64) error {
	s.published = append(s.published, id)
	return s.markPublishErr
}

func (s *publisherOutboxStub) MarkFailed(_ context.Context, id int64, attempts int, _ time.Time, errCode string) error {
	s.failed = append(s.failed, publisherFailure{id: id, attempts: attempts, errCode: errCode})
	return nil
}

type publisherProducerStub struct {
	err     error
	message asynqqueue.Message
}

func (s *publisherProducerStub) Enqueue(_ context.Context, message asynqqueue.Message) error {
	s.message = message
	return s.err
}

func TestPublisherRelayTreatsTaskIDConflictAsPublished(t *testing.T) {
	outbox := &publisherOutboxStub{}
	producer := &publisherProducerStub{err: fmt.Errorf("wrapped: %w", asynq.ErrTaskIDConflict)}
	publisher := &Publisher{outbox: outbox, producer: producer}

	err := publisher.relay(context.Background(), postgres.PendingMessage{
		ID:          42,
		PublicID:    "outbox-public-id",
		Kind:        asynqqueue.KindSendDispatch,
		AvailableAt: time.Now(),
		Attempts:    4,
	})
	if err != nil {
		t.Fatalf("relay returned error for an existing task: %v", err)
	}
	if len(outbox.published) != 1 || outbox.published[0] != 42 {
		t.Fatalf("published calls = %#v, want [42]", outbox.published)
	}
	if len(outbox.failed) != 0 {
		t.Fatalf("failed calls = %#v, want none", outbox.failed)
	}
}

func TestPublisherRelayBacksOffTransientEnqueueFailure(t *testing.T) {
	outbox := &publisherOutboxStub{}
	producer := &publisherProducerStub{err: errors.New("redis unavailable")}
	publisher := &Publisher{outbox: outbox, producer: producer}

	err := publisher.relay(context.Background(), postgres.PendingMessage{
		ID:       7,
		PublicID: "outbox-public-id",
		Kind:     asynqqueue.KindSendDispatch,
		Attempts: 2,
	})
	if err == nil || !errors.Is(err, producer.err) {
		t.Fatalf("relay error = %v, want wrapped enqueue error", err)
	}
	if len(outbox.published) != 0 {
		t.Fatalf("published calls = %#v, want none", outbox.published)
	}
	if len(outbox.failed) != 1 || outbox.failed[0].attempts != 3 || outbox.failed[0].errCode != "enqueue_failed" {
		t.Fatalf("failed calls = %#v, want attempt 3 enqueue_failed", outbox.failed)
	}
}
