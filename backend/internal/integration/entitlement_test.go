package integration

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func newEntSvc() *entitlement.Service {
	repo := postgres.NewEntitlementRepo(pool)
	return entitlement.NewService(repo, repo, repo, repo,
		postgres.NewUserLockRepo(pool), postgres.NewTxManager(pool), []byte(testCardPepper))
}

func newUser(t *testing.T) int64 {
	t.Helper()
	svc := auth.NewService(
		postgres.NewAuthUserRepo(pool), postgres.NewAuthSessionRepo(pool), postgres.NewTxManager(pool),
		auth.NewHasher(), []byte(testSigningKey), []byte(testPepper),
		15*time.Minute, 30*24*time.Hour, nil)
	res, err := svc.Register(context.Background(), "entuser_"+randSuffix(), "password123")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	return res.User.ID
}

func seedCard(t *testing.T, ent *entitlement.Service, adminID int64) (string, entitlement.Plan) {
	t.Helper()
	ctx := context.Background()
	// Idempotent demo plan.
	var plan *entitlement.Plan
	plans, _ := postgres.NewEntitlementRepo(pool).ListPlans(ctx)
	for _, p := range plans {
		if p.Code == "standard" {
			plan = p
			break
		}
	}
	if plan == nil {
		p, err := ent.CreatePlan(ctx, &entitlement.Plan{
			Code: "standard", Name: "标准版", Status: entitlement.StatusActive,
			AccountQuota: 3, TaskQuota: 10, DailySendQuota: 20,
			Features: map[string]bool{"browser_text_send": true},
		})
		if err != nil {
			t.Fatalf("create plan: %v", err)
		}
		plan = p
	}
	_ = newUser // avoid unused
	batch, err := ent.CreateBatchWithCodes(ctx, &entitlement.CardBatch{
		EntitlementPlanID: plan.ID, Name: "t-30d", DurationDays: 30, Quantity: 1,
		Status: entitlement.StatusActive, CodeVersion: entitlement.CardCodeVersion1,
		CreatedBy: adminID,
	})
	if err != nil {
		t.Fatalf("create batch: %v", err)
	}
	return batch[0], *plan
}

func TestRedeemOnceThenConflict(t *testing.T) {
	ctx := context.Background()
	ent := newEntSvc()
	admin := newUser(t)
	user := newUser(t)
	code, _ := seedCard(t, ent, admin)

	grant, eff, err := ent.Redeem(ctx, user, code)
	if err != nil {
		t.Fatalf("redeem: %v", err)
	}
	if !eff.Active || eff.PlanCode != "standard" || eff.AccountQuota != 3 {
		t.Fatalf("unexpected effective entitlement: %+v", eff)
	}
	if !grant.ExpiresAt.After(grant.StartsAt) {
		t.Fatalf("bad grant window")
	}

	// Replaying the same code for the same user is idempotent and returns the
	// original grant instead of extending it a second time.
	replayed, replayedEff, err := ent.Redeem(ctx, user, code)
	if err != nil || replayed.PublicID != grant.PublicID || !replayed.ExpiresAt.Equal(grant.ExpiresAt) || replayedEff.PlanCode != eff.PlanCode {
		t.Fatalf("replayed redeem = %+v effective=%+v err=%v", replayed, replayedEff, err)
	}

	// A different user receives a stable conflict and cannot learn the grant.
	otherUser := newUser(t)
	if _, _, err := ent.Redeem(ctx, otherUser, code); err == nil {
		t.Fatalf("expected conflict for another user")
	} else if app, ok := apperr.As(err); !ok || app.Code != apperr.CodeCardAlreadyRedeemed {
		t.Fatalf("other-user redeem error = %v, want %s", err, apperr.CodeCardAlreadyRedeemed)
	}
}

func TestConcurrentRedeemDoesNotOverlap(t *testing.T) {
	ctx := context.Background()
	ent := newEntSvc()
	admin := newUser(t)
	user := newUser(t)
	code1, _ := seedCard(t, ent, admin)
	code2, _ := seedCard(t, ent, admin)

	var wg sync.WaitGroup
	var g1, g2 entitlement.Grant
	var e1, e2 error
	wg.Add(2)
	go func() { defer wg.Done(); g1, _, e1 = ent.Redeem(ctx, user, code1) }()
	go func() { defer wg.Done(); g2, _, e2 = ent.Redeem(ctx, user, code2) }()
	wg.Wait()
	if e1 != nil || e2 != nil {
		t.Fatalf("redeem errors: %v, %v", e1, e2)
	}
	// Adjacent grants are fine; only a real overlap (>1µs skew) fails.
	eps := time.Microsecond
	if g1.ExpiresAt.After(g2.StartsAt.Add(eps)) && g2.ExpiresAt.After(g1.StartsAt.Add(eps)) {
		t.Fatalf("grants overlap: [%s,%s] vs [%s,%s]", g1.StartsAt, g1.ExpiresAt, g2.StartsAt, g2.ExpiresAt)
	}
}

func TestDailyQuotaReserve(t *testing.T) {
	ctx := context.Background()
	ent := newEntSvc()
	user := newUser(t)
	date := entitlement.EffectiveLocalDate(time.Now())

	// No entitlement -> reserve fails.
	if err := ent.ReserveDaily(ctx, user, date); err == nil {
		t.Fatalf("expected entitlement-required error")
	}

	admin := newUser(t)
	code, _ := seedCard(t, ent, admin)
	if _, _, err := ent.Redeem(ctx, user, code); err != nil {
		t.Fatalf("redeem: %v", err)
	}
	// quota = 20 per plan; reserve 3, release 1, then re-reserve.
	for i := 0; i < 3; i++ {
		if err := ent.ReserveDaily(ctx, user, date); err != nil {
			t.Fatalf("reserve %d: %v", i, err)
		}
	}
	if err := ent.ReleaseDaily(ctx, user, date); err != nil {
		t.Fatalf("release: %v", err)
	}
	if err := ent.ReserveDaily(ctx, user, date); err != nil {
		t.Fatalf("re-reserve: %v", err)
	}
}

func TestAuthorizeGates(t *testing.T) {
	ctx := context.Background()
	ent := newEntSvc()
	noEnt := newUser(t)

	dec, err := ent.Authorize(ctx, entitlement.AuthorizationRequest{
		UserID: noEnt, Action: entitlement.ActionAccountBind,
	})
	if err != nil {
		t.Fatalf("authorize: %v", err)
	}
	if dec.Allowed {
		t.Fatalf("expected denial without entitlement")
	}

	user := newUser(t)
	admin := newUser(t)
	code, _ := seedCard(t, ent, admin)
	if _, _, err := ent.Redeem(ctx, user, code); err != nil {
		t.Fatalf("redeem: %v", err)
	}
	dec, err = ent.Authorize(ctx, entitlement.AuthorizationRequest{
		UserID: user, Action: entitlement.ActionSendExecute,
	})
	if err != nil || !dec.Allowed {
		t.Fatalf("expected allowed: %v %+v", err, dec)
	}
}

func randSuffix() string {
	return newUUID().String()[:8]
}
