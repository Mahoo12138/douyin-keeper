package integration

import (
	"context"
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminEntitlementSummariesAndDisableAudit(t *testing.T) {
	ctx := context.Background()
	actorID := newUser(t)
	userID := newUser(t)
	repo := postgres.NewEntitlementRepo(pool)
	ent := entitlement.NewService(repo, repo, repo, repo, postgres.NewUserLockRepo(pool), postgres.NewTxManager(pool), []byte(testCardPepper)).WithAudit(repo)

	plan, err := ent.CreatePlanByAdmin(ctx, actorID, &entitlement.Plan{
		Code: "admin_" + randSuffix(), Name: "管理员验收方案", Status: entitlement.StatusActive,
		AccountQuota: 2, TaskQuota: 5, DailySendQuota: 10, Features: map[string]bool{"browser_text_send": true},
	})
	if err != nil {
		t.Fatal(err)
	}
	codes, err := ent.CreateBatchWithCodesByAdmin(ctx, actorID, &entitlement.CardBatch{
		EntitlementPlanID: plan.ID, Name: "管理员验收批次", DurationDays: 30, Quantity: 2,
		Status: entitlement.StatusActive, CodeVersion: entitlement.CardCodeVersion1,
	})
	if err != nil || len(codes) != 2 {
		t.Fatalf("created codes = %d, err = %v", len(codes), err)
	}

	summary, err := ent.GetBatchSummary(ctx, plan.PublicID)
	if err == nil {
		t.Fatalf("plan id must not resolve as batch: %+v", summary)
	}
	batches, err := ent.ListBatchSummaries(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	var batch entitlement.CardBatchSummary
	found := false
	for _, item := range batches {
		if item.Name == "管理员验收批次" {
			batch, found = item, true
			break
		}
	}
	if !found || batch.UnusedCount != 2 || batch.RedeemedCount != 0 || batch.PlanCode != plan.Code {
		t.Fatalf("batch summary = %+v", batch)
	}

	if _, _, err := ent.Redeem(ctx, userID, codes[0]); err != nil {
		t.Fatal(err)
	}
	redemptions, err := ent.ListRedemptionSummaries(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	var redemption entitlement.RedemptionSummary
	for _, item := range redemptions {
		if item.UserDisplayName != "" && item.PlanCode == plan.Code {
			redemption = item
			break
		}
	}
	if redemption.CodeFingerprint == nil || *redemption.CodeFingerprint == codes[0] || redemption.SourceType != entitlement.SourceCard {
		t.Fatalf("redemption summary exposed plaintext or missing source: %+v", redemption)
	}

	if err := ent.DisableBatchByAdmin(ctx, actorID, batch.PublicID); err != nil {
		t.Fatal(err)
	}
	if err := ent.DisablePlanByAdmin(ctx, actorID, plan.PublicID); err != nil {
		t.Fatal(err)
	}
	updated, err := ent.GetBatchSummary(ctx, batch.PublicID)
	if err != nil || updated.Status != entitlement.StatusDisabled {
		t.Fatalf("disabled batch = %+v, err = %v", updated, err)
	}
	var auditCount int
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM audit_logs
		WHERE actor_user_id=$1 AND action IN ('entitlement.plan.create', 'entitlement.plan.disable')
		  AND resource_type='entitlement_plan' AND resource_id=$2`, actorID, plan.PublicID.String()).Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if auditCount < 2 {
		t.Fatalf("plan audit count = %d", auditCount)
	}
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM audit_logs
		WHERE actor_user_id=$1 AND action IN ('entitlement.batch.create', 'entitlement.batch.disable')
		  AND resource_type='card_batch' AND resource_id=$2`, actorID, batch.PublicID.String()).Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if auditCount < 2 {
		t.Fatalf("batch audit count = %d", auditCount)
	}
}
