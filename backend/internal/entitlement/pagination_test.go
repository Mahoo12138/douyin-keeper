package entitlement

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

type paginationBatchStub struct {
	items []CardBatchSummary
}

type paginationPlanStub struct {
	items []*Plan
}

func (r paginationPlanStub) CreatePlan(context.Context, *Plan) error { return nil }
func (r paginationPlanStub) GetPlanByID(context.Context, int64) (*Plan, error) {
	return nil, nil
}
func (r paginationPlanStub) GetPlanByPublicID(context.Context, uuid.UUID) (*Plan, error) {
	return nil, nil
}
func (r paginationPlanStub) ListPlans(context.Context) ([]*Plan, error) { return r.items, nil }
func (r paginationPlanStub) ListPlansPage(context.Context, PlanListFilter) ([]*Plan, error) {
	return r.items, nil
}
func (r paginationPlanStub) DisablePlan(context.Context, int64, uuid.UUID) error { return nil }

func (r paginationBatchStub) CreateBatch(context.Context, *CardBatch) error         { return nil }
func (r paginationBatchStub) InsertCodes(context.Context, int64, []*CardCode) error { return nil }
func (r paginationBatchStub) ListSummaries(context.Context, int) ([]CardBatchSummary, error) {
	return r.items, nil
}
func (r paginationBatchStub) ListSummariesPage(context.Context, BatchListFilter) ([]CardBatchSummary, error) {
	return r.items, nil
}
func (r paginationBatchStub) GetSummaryByPublicID(context.Context, uuid.UUID) (CardBatchSummary, error) {
	return CardBatchSummary{}, nil
}
func (r paginationBatchStub) DisableBatch(context.Context, int64, uuid.UUID) error { return nil }
func (r paginationBatchStub) ListCodeSummaries(context.Context, uuid.UUID, int) ([]CardCodeSummary, error) {
	return []CardCodeSummary{{ID: 3}, {ID: 2}, {ID: 1}}, nil
}
func (r paginationBatchStub) ListCodeSummariesPage(context.Context, uuid.UUID, CardCodeListFilter) ([]CardCodeSummary, error) {
	return []CardCodeSummary{{ID: 3}, {ID: 2}, {ID: 1}}, nil
}
func (r paginationBatchStub) RevokeUnusedCode(context.Context, int64, uuid.UUID, int64, string) error {
	return nil
}
func (r paginationBatchStub) GetCodeByHashForUpdate(context.Context, []byte) (*CardCode, error) {
	return nil, nil
}
func (r paginationBatchStub) MarkCodeRedeemed(context.Context, int64, int64, time.Time) error {
	return nil
}

func TestListBatchSummariesPageTrimsAndBuildsCursor(t *testing.T) {
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	service := &Service{batches: paginationBatchStub{items: []CardBatchSummary{
		{CardBatch: CardBatch{ID: 3, CreatedAt: base.Add(2 * time.Minute)}},
		{CardBatch: CardBatch{ID: 2, CreatedAt: base.Add(time.Minute)}},
		{CardBatch: CardBatch{ID: 1, CreatedAt: base}},
	}}}
	page, err := service.ListBatchSummariesPage(context.Background(), BatchListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].ID != 3 || page.Items[1].ID != 2 || page.NextAfterID != 2 || page.NextCreatedAt == nil {
		t.Fatalf("page = %+v", page)
	}
}

func TestListPlansPageTrimsAndBuildsCursor(t *testing.T) {
	service := &Service{plans: paginationPlanStub{items: []*Plan{{ID: 1}, {ID: 2}, {ID: 3}}}}
	page, err := service.ListPlansPage(context.Background(), PlanListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].ID != 1 || page.Items[1].ID != 2 || page.NextAfterID != 2 {
		t.Fatalf("page = %+v", page)
	}
}

func TestListRedemptionSummariesPageTrimsAndBuildsCursor(t *testing.T) {
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	service := &Service{grants: entitlementGrantStub{redemptions: []RedemptionSummary{
		{GrantID: 3, CreatedAt: base.Add(2 * time.Minute)},
		{GrantID: 2, CreatedAt: base.Add(time.Minute)},
		{GrantID: 1, CreatedAt: base},
	}}}
	page, err := service.ListRedemptionSummariesPage(context.Background(), RedemptionListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].GrantID != 3 || page.Items[1].GrantID != 2 || page.NextAfterID != 2 || page.NextCreatedAt == nil {
		t.Fatalf("page = %+v", page)
	}
}

func TestListCardCodeSummariesPageBuildsCursor(t *testing.T) {
	service := &Service{batches: paginationBatchStub{}}
	page, err := service.ListCardCodeSummariesPage(context.Background(), uuid.New(), CardCodeListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].ID != 3 || page.Items[1].ID != 2 || page.NextAfterID != 2 {
		t.Fatalf("page = %+v", page)
	}
}

func TestListUserGrantSummariesPageBuildsCursor(t *testing.T) {
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	service := &Service{grants: entitlementGrantStub{redemptions: []RedemptionSummary{
		{GrantID: 3, CreatedAt: base.Add(2 * time.Minute)},
		{GrantID: 2, CreatedAt: base.Add(time.Minute)},
		{GrantID: 1, CreatedAt: base},
	}}}
	page, err := service.ListUserGrantSummariesPage(context.Background(), 7, RedemptionListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.NextAfterID != 2 || page.NextCreatedAt == nil {
		t.Fatalf("page = %+v", page)
	}
}
