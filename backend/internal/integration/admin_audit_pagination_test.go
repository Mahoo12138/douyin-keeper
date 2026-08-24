package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminAuditListCursorPageIsStable(t *testing.T) {
	ctx := context.Background()
	actorID := newUser(t)
	now := time.Now().UTC()
	for i := 0; i < 3; i++ {
		if _, err := pool.Exec(ctx, `
			INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail_json, created_at)
			VALUES ($1,'adapter.disable','adapter',$2,'{}'::jsonb,$3)`, actorID, uuid.NewString(), now.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatal(err)
		}
	}

	service := admin.NewService(postgres.NewAdminRepo(pool, nil))
	first, err := service.ListAuditLogsPage(ctx, admin.AuditFilter{Action: "adapter.disable", ResourceType: "adapter", Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 || first.NextCreatedAt == nil {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListAuditLogsPage(ctx, admin.AuditFilter{
		Action: "adapter.disable", ResourceType: "adapter", Limit: 2,
		AfterCreatedAt: first.NextCreatedAt, AfterID: first.NextAfterID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) == 0 {
		t.Fatalf("second page is empty: %+v", second)
	}
	if first.Items[1].CreatedAt.Before(second.Items[0].CreatedAt) ||
		(first.Items[1].CreatedAt.Equal(second.Items[0].CreatedAt) && first.Items[1].ID <= second.Items[0].ID) {
		t.Fatalf("cursor order is not stable: first=%+v second=%+v", first, second)
	}
}
