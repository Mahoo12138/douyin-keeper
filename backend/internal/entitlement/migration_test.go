package entitlement

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

type migrationPlanRepository struct {
	plans map[int64]*Plan
}

func (r migrationPlanRepository) CreatePlan(context.Context, *Plan) error { return nil }
func (r migrationPlanRepository) GetPlanByID(_ context.Context, id int64) (*Plan, error) {
	return r.plans[id], nil
}
func (r migrationPlanRepository) GetPlanByPublicID(context.Context, uuid.UUID) (*Plan, error) {
	return nil, nil
}
func (r migrationPlanRepository) ListPlans(context.Context) ([]*Plan, error)          { return nil, nil }
func (r migrationPlanRepository) DisablePlan(context.Context, int64, uuid.UUID) error { return nil }

type migrationGrantRepository struct {
	entitlementGrantStub
	active  []*Grant
	revoked []int64
}

func (r *migrationGrantRepository) CreateGrant(_ context.Context, grant *Grant) error {
	r.grant = grant
	return nil
}

func (r *migrationGrantRepository) ListActiveOrScheduledGrants(context.Context, int64, time.Time) ([]*Grant, error) {
	return r.active, nil
}
func (r *migrationGrantRepository) RevokeGrant(_ context.Context, grantID, _ int64, _ string) error {
	r.revoked = append(r.revoked, grantID)
	return nil
}

type migrationBatchRepository struct {
	code     *CardCode
	redeemed bool
}

func (migrationBatchRepository) CreateBatch(context.Context, *CardBatch) error         { return nil }
func (migrationBatchRepository) InsertCodes(context.Context, int64, []*CardCode) error { return nil }
func (migrationBatchRepository) ListSummaries(context.Context, int) ([]CardBatchSummary, error) {
	return nil, nil
}
func (migrationBatchRepository) GetSummaryByPublicID(context.Context, uuid.UUID) (CardBatchSummary, error) {
	return CardBatchSummary{}, nil
}
func (migrationBatchRepository) DisableBatch(context.Context, int64, uuid.UUID) error { return nil }
func (migrationBatchRepository) ListCodeSummaries(context.Context, uuid.UUID, int) ([]CardCodeSummary, error) {
	return nil, nil
}
func (migrationBatchRepository) RevokeUnusedCode(context.Context, int64, uuid.UUID, int64, string) error {
	return nil
}
func (r migrationBatchRepository) GetCodeByHashForUpdate(context.Context, []byte) (*CardCode, error) {
	return r.code, nil
}
func (r *migrationBatchRepository) MarkCodeRedeemed(context.Context, int64, int64, time.Time) error {
	r.redeemed = true
	return nil
}

type migrationUserLocker struct{}

func (migrationUserLocker) LockUserForUpdate(context.Context, int64) error { return nil }

type migrationTx struct{}

func (migrationTx) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

type migrationUsage struct{}

func (migrationUsage) ReserveDailySend(context.Context, int64, string, int) (bool, error) {
	return true, nil
}
func (migrationUsage) GetDailyUsage(context.Context, int64, string) (*DailyUsage, error) {
	return nil, nil
}
func (migrationUsage) IncrSucceeded(context.Context, int64, string) error    { return nil }
func (migrationUsage) IncrFailed(context.Context, int64, string) error       { return nil }
func (migrationUsage) ReleaseDailySend(context.Context, int64, string) error { return nil }

func TestMigrateActiveGrantsRevokesTheWholeUnexpiredChain(t *testing.T) {
	now := time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC)
	last := &Grant{ID: 2, EntitlementPlanID: 1, StartsAt: now.Add(24 * time.Hour), ExpiresAt: now.Add(48 * time.Hour)}
	repo := &migrationGrantRepository{active: []*Grant{
		{ID: 1, EntitlementPlanID: 1, StartsAt: now.Add(-24 * time.Hour), ExpiresAt: now.Add(24 * time.Hour)},
		last,
	}}
	svc := &Service{
		plans: migrationPlanRepository{plans: map[int64]*Plan{
			1: {ID: 1, Code: "standard", MigrationWeight: 1},
		}},
		grants: repo,
	}

	converted, err := svc.migrateActiveGrants(context.Background(), 7, last, &Plan{ID: 2, Code: "pro", MigrationWeight: 2}, now, 7)
	if err != nil {
		t.Fatal(err)
	}
	if converted != 24*time.Hour {
		t.Fatalf("converted duration = %s, want 24h", converted)
	}
	if len(repo.revoked) != 2 || repo.revoked[0] != 1 || repo.revoked[1] != 2 {
		t.Fatalf("revoked grants = %v, want [1 2]", repo.revoked)
	}
}

func TestRedeemMigratesActiveGrantBeforeCreatingNewCardGrant(t *testing.T) {
	now := time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC)
	old := &Grant{ID: 1, EntitlementPlanID: 1, StartsAt: now.Add(-time.Hour), ExpiresAt: now.Add(24 * time.Hour), Plan: &Plan{ID: 1, Code: "standard", MigrationWeight: 1}}
	rawCode, err := GenerateCode()
	if err != nil {
		t.Fatal(err)
	}
	code := &CardCode{
		ID: 9, Status: "unused", CodeFingerprint: "fingerprint",
		Batch: &CardBatch{ID: 4, EntitlementPlanID: 2, DurationDays: 1, Status: StatusActive},
		Plan:  &Plan{ID: 2, Code: "pro", MigrationWeight: 2, Status: StatusActive},
	}
	grants := &migrationGrantRepository{entitlementGrantStub: entitlementGrantStub{grant: old}, active: []*Grant{old}}
	batches := &migrationBatchRepository{code: code}
	svc := &Service{
		plans: migrationPlanRepository{plans: map[int64]*Plan{1: old.Plan}}, grants: grants, batches: batches,
		userLock: migrationUserLocker{}, tx: migrationTx{}, usage: migrationUsage{}, pepper: []byte("pepper"),
		now: func() time.Time { return now },
	}

	grant, effective, err := svc.Redeem(context.Background(), 7, rawCode)
	if err != nil {
		t.Fatal(err)
	}
	if grant.Plan == nil || grant.Plan.Code != "pro" || grant.StartsAt != now || grant.ExpiresAt != now.Add(36*time.Hour) {
		t.Fatalf("migrated grant = %+v, want pro grant from now for 36h", grant)
	}
	if !batches.redeemed || len(grants.revoked) != 1 || grants.revoked[0] != old.ID {
		t.Fatalf("redeem migration state redeemed=%v revoked=%v", batches.redeemed, grants.revoked)
	}
	if !effective.Active || effective.PlanCode != "pro" {
		t.Fatalf("effective entitlement = %+v, want active pro", effective)
	}
}
