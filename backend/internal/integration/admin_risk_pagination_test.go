package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminRiskListCursorPageIsStable(t *testing.T) {
	ctx := context.Background()
	ownerID := newUser(t)
	now := time.Now().UTC()
	item := &account.Account{
		PublicID: uuid.New(), UserID: ownerID, Nickname: "风险分页账号",
		BindingStatus: account.BindingBound, SessionStatus: account.SessionValid,
		RiskStatus: account.RiskNormal, CreatedAt: now, UpdatedAt: now,
	}
	if err := postgres.NewAccountRepo(pool).Create(ctx, item); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if _, err := pool.Exec(ctx, `
			INSERT INTO risk_events (public_id, account_id, category, code, severity, detail_json, created_at)
			VALUES ($1,$2,'AUTH',$3,'warning','{}'::jsonb,$4)`, uuid.New(), item.ID, "SESSION_EXPIRED", now.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatal(err)
		}
	}

	service := admin.NewService(postgres.NewAdminRepo(pool, nil))
	first, err := service.ListRisksPage(ctx, admin.RiskFilter{Category: "AUTH", Severity: "warning", Code: "SESSION_EXPIRED", Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 || first.NextCreatedAt == nil {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListRisksPage(ctx, admin.RiskFilter{
		Category: "AUTH", Severity: "warning", Code: "SESSION_EXPIRED", Limit: 2,
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
