package integration

import (
	"context"
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
)

func TestAdminBatchListCursorPageIsStable(t *testing.T) {
	ctx := context.Background()
	service := newEntSvc()
	adminID := newUser(t)
	for i := 0; i < 3; i++ {
		seedCard(t, service, adminID)
	}

	first, err := service.ListBatchSummariesPage(ctx, entitlement.BatchListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 || first.NextCreatedAt == nil {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListBatchSummariesPage(ctx, entitlement.BatchListFilter{
		Limit: 2, AfterCreatedAt: first.NextCreatedAt, AfterID: first.NextAfterID,
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

func TestAdminRedemptionListCursorPageIsStable(t *testing.T) {
	ctx := context.Background()
	service := newEntSvc()
	adminID := newUser(t)
	for i := 0; i < 3; i++ {
		code, _ := seedCard(t, service, adminID)
		if _, _, err := service.Redeem(ctx, newUser(t), code); err != nil {
			t.Fatal(err)
		}
	}

	first, err := service.ListRedemptionSummariesPage(ctx, entitlement.RedemptionListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextAfterID == 0 || first.NextCreatedAt == nil {
		t.Fatalf("first page = %+v", first)
	}
	second, err := service.ListRedemptionSummariesPage(ctx, entitlement.RedemptionListFilter{
		Limit: 2, AfterCreatedAt: first.NextCreatedAt, AfterID: first.NextAfterID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) == 0 {
		t.Fatalf("second page is empty: %+v", second)
	}
	if first.Items[1].CreatedAt.Before(second.Items[0].CreatedAt) ||
		(first.Items[1].CreatedAt.Equal(second.Items[0].CreatedAt) && first.Items[1].GrantID <= second.Items[0].GrantID) {
		t.Fatalf("cursor order is not stable: first=%+v second=%+v", first, second)
	}
}
