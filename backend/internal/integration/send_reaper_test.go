package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/scheduler"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

func TestSendLeaseReaperFailsClosedAndReleasesQuota(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	ent := newEntSvc()
	adminID := newUser(t)
	code, _ := seedCard(t, ent, adminID)
	if _, _, err := ent.Redeem(ctx, userID, code); err != nil {
		t.Fatalf("redeem: %v", err)
	}

	when := time.Now().UTC().Truncate(time.Microsecond)
	date := entitlement.EffectiveLocalDate(when)
	if err := ent.ReserveDaily(ctx, userID, date); err != nil {
		t.Fatalf("reserve: %v", err)
	}
	accounts := postgres.NewAccountRepo(pool)
	acct := &account.Account{
		PublicID: uuid.New(), UserID: userID, BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: when, UpdatedAt: when,
	}
	if err := accounts.Create(ctx, acct); err != nil {
		t.Fatal(err)
	}
	friends := postgres.NewFriendRepo(pool)
	platformID := "reaper-platform-" + uuid.NewString()
	if err := postgres.NewTxManager(pool).WithinTx(ctx, func(tctx context.Context) error {
		return friends.SyncBatch(tctx, acct.ID, []friend.SyncItem{{
			PlatformUserID: &platformID, IdentityStatus: friend.IdentityResolved,
			DisplayName: "Reaper Target",
		}}, []string{platformID}, nil, when)
	}); err != nil {
		t.Fatal(err)
	}
	list, err := friends.ListByAccountOwned(ctx, userID, acct.PublicID)
	if err != nil || len(list) != 1 {
		t.Fatalf("friend setup: err=%v list=%+v", err, list)
	}

	sends := postgres.NewSendRepo(pool)
	requestID := uuid.New()
	in := &send.SendIntent{
		PublicID: uuid.New(), IntentType: send.IntentManual, RequestID: &requestID,
		LocalDate: &date, AccountID: acct.ID, FriendID: list[0].ID,
		ScheduledAt: when, Status: send.IntentQueued, CreatedAt: when, UpdatedAt: when,
	}
	if err := sends.CreateIntent(ctx, in); err != nil {
		t.Fatal(err)
	}
	j := &send.SendJob{PublicID: uuid.New(), IntentID: in.ID, AccountID: acct.ID,
		FriendID: list[0].ID, Attempt: 1, Status: send.JobQueued, CreatedAt: when}
	if err := sends.CreateJob(ctx, j); err != nil {
		t.Fatal(err)
	}
	claimed, err := sends.ClaimJob(ctx, j.PublicID, "expired-reaper-worker", -time.Minute)
	if err != nil || claimed == nil || claimed.Status != send.JobRunning {
		t.Fatalf("claim expired job: err=%v job=%+v", err, claimed)
	}

	reaper := scheduler.NewSendLeaseReaper(sends, ent, postgres.NewTxManager(pool), 10)
	reaper.SetNow(func() time.Time { return when })
	count, err := reaper.RunOnce(ctx)
	if err != nil || count != 1 {
		t.Fatalf("reaper count=%d err=%v", count, err)
	}
	finished, err := sends.GetJobByPublicID(ctx, j.PublicID)
	if err != nil || finished.Status != send.JobFailed || finished.ErrorCode == nil || *finished.ErrorCode != apperr.CodeOutcomeUnknown {
		t.Fatalf("reaped job=%+v err=%v", finished, err)
	}
	failedIntent, err := sends.GetIntentByPublicID(ctx, in.PublicID)
	if err != nil || failedIntent.Status != send.IntentFailed || failedIntent.ErrorCode == nil || *failedIntent.ErrorCode != apperr.CodeOutcomeUnknown {
		t.Fatalf("reaped intent=%+v err=%v", failedIntent, err)
	}
	usage, err := postgres.NewEntitlementRepo(pool).GetDailyUsage(ctx, userID, date)
	if err != nil || usage == nil || usage.ReservedSendCount != 0 || usage.FailedSendCount != 1 {
		t.Fatalf("usage=%+v err=%v", usage, err)
	}
	if count, err := reaper.RunOnce(ctx); err != nil || count != 0 {
		t.Fatalf("reaper repeated count=%d err=%v", count, err)
	}
}
