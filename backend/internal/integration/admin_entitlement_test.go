package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
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
	codeSummaries, err := ent.ListCardCodeSummaries(ctx, batch.PublicID, 100)
	if err != nil || len(codeSummaries) != 2 {
		t.Fatalf("code summaries = %+v, err = %v", codeSummaries, err)
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

	adminGrantUserID := newUser(t)
	adminGrant, err := ent.GrantByAdmin(ctx, actorID, adminGrantUserID, plan.ID, 7*24*time.Hour)
	if err != nil || adminGrant.PublicID == uuid.Nil {
		t.Fatalf("admin grant = %+v, err = %v", adminGrant, err)
	}
	userGrants, err := ent.ListUserGrantSummaries(ctx, adminGrantUserID, 100)
	if err != nil || len(userGrants) != 1 || userGrants[0].SourceType != entitlement.SourceAdmin {
		t.Fatalf("user grants = %+v, err = %v", userGrants, err)
	}
	if err := ent.RevokeGrantByAdmin(ctx, actorID, adminGrant.PublicID, "integration revoke"); err != nil {
		t.Fatal(err)
	}
	decision, err := ent.Authorize(ctx, entitlement.AuthorizationRequest{
		UserID: adminGrantUserID, Action: entitlement.ActionSendExecute,
	})
	if err != nil || decision.Allowed || decision.ReasonCode != apperr.CodeEntitlementExpired {
		t.Fatalf("revoked grant must be rejected immediately: decision=%+v err=%v", decision, err)
	}
	userGrants, err = ent.ListUserGrantSummaries(ctx, adminGrantUserID, 100)
	if err != nil || len(userGrants) != 1 || userGrants[0].RevokedAt == nil || userGrants[0].RevokeReason == nil {
		t.Fatalf("revoked user grant = %+v, err = %v", userGrants, err)
	}

	if err := ent.RevokeUnusedCodeByAdmin(ctx, actorID, batch.PublicID, codeSummaries[1].ID, "integration code revoke"); err != nil {
		t.Fatal(err)
	}
	codeSummaries, err = ent.ListCardCodeSummaries(ctx, batch.PublicID, 100)
	if err != nil || codeSummaries[1].Status != "revoked" {
		t.Fatalf("revoked code summaries = %+v, err = %v", codeSummaries, err)
	}

	if err := ent.DisableBatchByAdmin(ctx, actorID, batch.PublicID); err != nil {
		t.Fatal(err)
	}
	if err := ent.DisablePlanByAdmin(ctx, actorID, plan.PublicID); err != nil {
		t.Fatal(err)
	}
	updated, err := ent.GetBatchSummary(ctx, batch.PublicID)
	if err != nil || updated.Status != entitlement.StatusDisabled || updated.RevokedCount != 1 || updated.RedeemedCount != 1 {
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
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM audit_logs
		WHERE actor_user_id=$1 AND action='entitlement.grant.revoke'
		  AND resource_type='entitlement_grant' AND resource_id=$2`, actorID, adminGrant.PublicID.String()).Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if auditCount < 1 {
		t.Fatalf("grant revoke audit count = %d", auditCount)
	}
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM audit_logs
		WHERE actor_user_id=$1 AND action='entitlement.card_code.revoke'
		  AND resource_type='card_code' AND resource_id=$2`, actorID, codeSummaries[1].CodeFingerprint).Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if auditCount < 1 {
		t.Fatalf("card code revoke audit count = %d", auditCount)
	}
}
