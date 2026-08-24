package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminJobListCursorPageIsStableAndFiltered(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	now := time.Now().UTC()
	for i := 0; i < 3; i++ {
		if _, err := pool.Exec(ctx, `
			INSERT INTO jobs (public_id, user_id, type, status, error_code, cancelable, created_at)
			VALUES ($1,$2,'account.bind.qr','failed','SESSION_EXPIRED',false,$3)`, uuid.New(), userID, now.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatal(err)
		}
	}

	service := admin.NewService(postgres.NewAdminRepo(pool, nil))
	first, err := service.ListJobsPage(ctx, admin.JobListFilter{Status: "failed", Type: "account.bind.qr", Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 || first.NextCreatedAt == nil {
		t.Fatalf("first page = %+v", first)
	}
	for _, item := range first.Items {
		if item.Status != "failed" || item.Type != "account.bind.qr" || item.UserPublicID == nil || *item.UserPublicID == uuid.Nil {
			t.Fatalf("filter or public identity projection failed: %+v", item)
		}
	}

	second, err := service.ListJobsPage(ctx, admin.JobListFilter{
		Status: "failed", Type: "account.bind.qr", Limit: 2,
		AfterCreatedAt: first.NextCreatedAt, AfterID: first.NextAfterID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) != 1 {
		t.Fatalf("second page = %+v", second)
	}
	if first.Items[1].CreatedAt.Before(second.Items[0].CreatedAt) ||
		(first.Items[1].CreatedAt.Equal(second.Items[0].CreatedAt) && first.Items[1].ID <= second.Items[0].ID) {
		t.Fatalf("cursor order is not stable: first=%+v second=%+v", first, second)
	}
}
