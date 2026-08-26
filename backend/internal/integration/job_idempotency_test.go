package integration

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

func TestGenericJobIdempotencyIsScopedToUserAndRejectsDuplicateKeys(t *testing.T) {
	ctx := context.Background()
	repo := postgres.NewJobRepo(pool)
	ownerID := newUser(t)
	otherUserID := newUser(t)
	key := uuid.New().String()
	scope := "integration.account.binding:qr"
	now := time.Now().UTC()

	first := &job.Job{
		PublicID: uuid.New(), UserID: &ownerID, Type: "account.bind.qr",
		IdempotencyKey: &key, IdempotencyScope: &scope,
		Status: job.StatusQueued, Cancelable: true, CreatedAt: now,
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM jobs WHERE public_id = ANY($1::uuid[])`, []uuid.UUID{first.PublicID})
	}()
	if err := repo.CreateJob(ctx, first); err != nil {
		t.Fatalf("create first job: %v", err)
	}

	got, err := repo.GetByIdempotency(ctx, ownerID, key)
	if err != nil || got == nil || got.PublicID != first.PublicID || got.IdempotencyScope == nil || *got.IdempotencyScope != scope {
		t.Fatalf("lookup by idempotency key = %+v, err=%v", got, err)
	}

	duplicate := *first
	duplicate.ID = 0
	duplicate.PublicID = uuid.New()
	if err := repo.CreateJob(ctx, &duplicate); !errors.Is(err, job.ErrIdempotencyConflict) {
		t.Fatalf("duplicate key error = %v, want ErrIdempotencyConflict", err)
	}

	other := &job.Job{
		PublicID: uuid.New(), UserID: &otherUserID, Type: "account.bind.qr",
		IdempotencyKey: &key, IdempotencyScope: &scope,
		Status: job.StatusQueued, Cancelable: true, CreatedAt: now,
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM jobs WHERE public_id = $1`, other.PublicID)
	}()
	if err := repo.CreateJob(ctx, other); err != nil {
		t.Fatalf("same key for another user should be allowed: %v", err)
	}
}
