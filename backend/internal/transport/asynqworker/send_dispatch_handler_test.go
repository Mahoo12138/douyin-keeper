package asynqworker

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

type dispatchLoader struct{ message *postgres.PendingMessage }

func (l dispatchLoader) FetchByPublicID(context.Context, string) (*postgres.PendingMessage, error) {
	return l.message, nil
}

type dispatchRepo struct {
	send.Repository
	job       *send.SendJob
	intent    *send.SendIntent
	cancelled bool
}

func (r *dispatchRepo) GetJobByPublicID(context.Context, uuid.UUID) (*send.SendJob, error) {
	return r.job, nil
}

func (r *dispatchRepo) GetIntentByPublicID(context.Context, uuid.UUID) (*send.SendIntent, error) {
	return r.intent, nil
}

func (r *dispatchRepo) CancelQueuedJob(context.Context, int64, *string, time.Time) (bool, error) {
	r.cancelled = true
	return true, nil
}

type dispatchOutbox struct{ added int }

func (o *dispatchOutbox) Add(context.Context, outbox.Message) error {
	o.added++
	return nil
}

func TestSendDispatchClosesAttemptWhenIntentIsAlreadyTerminal(t *testing.T) {
	jobID := uuid.New()
	intentID := uuid.New()
	code := "ACCOUNT_RELEASED"
	repo := &dispatchRepo{
		job:    &send.SendJob{ID: 7, PublicID: jobID, Status: send.JobQueued},
		intent: &send.SendIntent{PublicID: intentID, Status: send.IntentCancelled, ErrorCode: &code},
	}
	outboxRepo := &dispatchOutbox{}
	handler := sendDispatchHandler(dispatchLoader{message: &postgres.PendingMessage{
		Payload: []byte(`{"intent_id":"` + intentID.String() + `","job_id":"` + jobID.String() + `"}`),
	}}, SendDispatchDeps{Sends: repo, Outbox: outboxRepo, Tx: fallbackTx{}})

	if err := handler(context.Background(), asynq.NewTask("send.dispatch", []byte(`{"outbox_id":"outbox-1"}`))); err != nil {
		t.Fatal(err)
	}
	if !repo.cancelled {
		t.Fatal("terminal intent did not close its queued attempt")
	}
	if outboxRepo.added != 0 {
		t.Fatalf("terminal intent emitted %d adapter outboxes", outboxRepo.added)
	}
}
