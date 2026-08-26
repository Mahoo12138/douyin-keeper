package account

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
)

func TestBindingJobPayloadCarriesSMSPhoneOnlyToWorkerHandoff(t *testing.T) {
	jobID := uuid.New()
	var payload map[string]string
	if err := json.Unmarshal(bindingJobPayload(jobID, "+86 13800138000"), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["job_id"] != jobID.String() || payload["phone"] != "+86 13800138000" {
		t.Fatalf("unexpected binding payload: %+v", payload)
	}
	if _, ok := payload["code"]; ok {
		t.Fatal("SMS verification code must not be included in the binding payload")
	}
}

type captureBindingJobCreator struct{ created *job.Job }

func (c *captureBindingJobCreator) CreateJob(_ context.Context, created *job.Job) error {
	c.created = created
	return nil
}

type captureIdempotentJobCreator struct {
	created  *job.Job
	existing *job.Job
}

func (c *captureIdempotentJobCreator) CreateJob(_ context.Context, created *job.Job) error {
	copy := *created
	c.created = &copy
	return nil
}

func (c *captureIdempotentJobCreator) GetByIdempotency(context.Context, int64, string) (*job.Job, error) {
	return c.existing, nil
}

func TestSessionCheckIdempotencyReplaysTheOriginalJob(t *testing.T) {
	publicID := uuid.New()
	scope := "account.session_check.browser:" + publicID.String()
	existing := &job.Job{PublicID: uuid.New(), IdempotencyScope: &scope}
	repo := &releaseRepo{account: &Account{ID: 42, PublicID: publicID, UserID: 7, BindingStatus: BindingBound}}
	jobs := &captureIdempotentJobCreator{existing: existing}
	outboxRepo := &captureBindingOutbox{}
	service := NewService(repo, inlineReleaseTx{}, nil, nil, jobs, outboxRepo)

	got, err := service.RequestSessionCheckWithKey(context.Background(), 7, publicID, uuid.New().String())
	if err != nil || got != existing.PublicID {
		t.Fatalf("same account operation key should replay the original job: got=%s err=%v", got, err)
	}
	if jobs.created != nil || len(outboxRepo.messages) != 0 {
		t.Fatalf("replay should not create another job or outbox message: job=%+v outbox=%d", jobs.created, len(outboxRepo.messages))
	}
}

type captureBindingOutbox struct{ messages []outbox.Message }

func (c *captureBindingOutbox) Add(_ context.Context, message outbox.Message) error {
	c.messages = append(c.messages, message)
	return nil
}

type captureUserLock struct{ userID int64 }

func (c *captureUserLock) LockUserForUpdate(_ context.Context, userID int64) error {
	c.userID = userID
	return nil
}

func TestRebindCreatesJobForExistingAccountWithoutCreatingAnotherAccount(t *testing.T) {
	publicID := uuid.New()
	repo := &releaseRepo{account: &Account{ID: 42, PublicID: publicID, UserID: 7, BindingStatus: BindingBound}}
	jobs := &captureBindingJobCreator{}
	outboxRepo := &captureBindingOutbox{}
	userLock := &captureUserLock{}
	service := NewService(repo, inlineReleaseTx{}, nil, userLock, jobs, outboxRepo)

	jobID, err := service.Rebind(context.Background(), 7, publicID, "qr", "")
	if err != nil {
		t.Fatal(err)
	}
	if jobID == uuid.Nil || jobs.created == nil || jobs.created.PublicID != jobID {
		t.Fatalf("unexpected rebind job: %+v", jobs.created)
	}
	if jobs.created.AccountID == nil || *jobs.created.AccountID != 42 {
		t.Fatalf("job account id = %+v, want 42", jobs.created.AccountID)
	}
	if userLock.userID != 7 {
		t.Fatalf("user lock id = %d, want 7", userLock.userID)
	}
	if len(outboxRepo.messages) != 1 || outboxRepo.messages[0].Kind != outbox.KindAccountBindQR {
		t.Fatalf("unexpected rebind outbox: %+v", outboxRepo)
	}
	if outboxRepo.messages[0].DedupeKey == "account.binding:"+publicID.String() {
		t.Fatal("rebind must use a new lifecycle dedupe key")
	}
	if repo.status != "" {
		t.Fatalf("rebind should not mutate binding status before success, got %q", repo.status)
	}
}

func TestRebindRejectsUnboundAccount(t *testing.T) {
	publicID := uuid.New()
	repo := &releaseRepo{account: &Account{ID: 42, PublicID: publicID, UserID: 7, BindingStatus: BindingBinding}}
	service := NewService(repo, inlineReleaseTx{}, nil, nil, nil, nil)

	_, err := service.Rebind(context.Background(), 7, publicID, "qr", "")
	appErr, ok := apperr.As(err)
	if !ok || appErr.Code != apperr.CodeConflict {
		t.Fatalf("error = %v, want conflict", err)
	}
}

func TestRebindSMSUsesReLoginJobAndKeepsVerificationCodeOutOfPayload(t *testing.T) {
	publicID := uuid.New()
	repo := &releaseRepo{account: &Account{ID: 42, PublicID: publicID, UserID: 7, BindingStatus: BindingBound}}
	jobs := &captureBindingJobCreator{}
	outboxRepo := &captureBindingOutbox{}
	service := NewService(repo, inlineReleaseTx{}, nil, nil, jobs, outboxRepo)

	if _, err := service.Rebind(context.Background(), 7, publicID, "sms", "+86 13800138000"); err != nil {
		t.Fatal(err)
	}
	if jobs.created == nil || jobs.created.Type != "account.relogin.sms" {
		t.Fatalf("job type = %q, want account.relogin.sms", jobs.created.Type)
	}
	var payload map[string]string
	if err := json.Unmarshal(outboxRepo.messages[0].Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["phone"] != "+86 13800138000" {
		t.Fatalf("payload phone = %q", payload["phone"])
	}
	if _, ok := payload["code"]; ok {
		t.Fatal("SMS verification code must not be included in the outbox payload")
	}
}
