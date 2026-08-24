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

func TestRetryRunnerCreatesNextAttemptAndKeepsReservation(t *testing.T) {
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
	platformID := "retry-platform-" + uuid.NewString()
	if err := postgres.NewTxManager(pool).WithinTx(ctx, func(tctx context.Context) error {
		return friends.SyncBatch(tctx, acct.ID, []friend.SyncItem{{
			PlatformUserID: &platformID, IdentityStatus: friend.IdentityResolved,
			DisplayName: "Retry Target",
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
		ScheduledAt: when, Status: send.IntentFailed, CreatedAt: when, UpdatedAt: when,
	}
	if err := sends.CreateIntent(ctx, in); err != nil {
		t.Fatal(err)
	}
	failedCode := apperr.CodeNetworkTimeout
	job := &send.SendJob{PublicID: uuid.New(), IntentID: in.ID, AccountID: acct.ID,
		FriendID: list[0].ID, Attempt: 1, Status: send.JobFailed, Retryable: true, CreatedAt: when}
	if err := postgres.NewTxManager(pool).WithinTx(ctx, func(tctx context.Context) error {
		if err := sends.CreateJob(tctx, job); err != nil {
			return err
		}
		if err := sends.SetIntentLastJob(tctx, in.ID, job.ID); err != nil {
			return err
		}
		next := when.Add(-time.Second)
		return sends.SetIntentStatus(tctx, in.ID, send.IntentRetryWait, &failedCode, &next, when)
	}); err != nil {
		t.Fatal(err)
	}

	tx := postgres.NewTxManager(pool)
	runner := scheduler.NewRetryRunner(sends, ent, postgres.NewOutboxRepo(pool), tx, 10)
	runner.SetNow(func() time.Time { return when })
	stats, err := runner.RunOnce(ctx)
	if err != nil || stats.Scanned != 1 || stats.Requeued != 1 || stats.Exhausted != 0 {
		t.Fatalf("retry stats=%+v err=%v", stats, err)
	}
	intent, err := sends.GetIntentByPublicID(ctx, in.PublicID)
	if err != nil || intent.Status != send.IntentQueued || intent.LastJobID == nil {
		t.Fatalf("intent=%+v err=%v", intent, err)
	}
	count, err := sends.CountJobsForIntent(ctx, in.ID)
	if err != nil || count != 2 {
		t.Fatalf("job count=%d err=%v", count, err)
	}
	usage, err := postgres.NewEntitlementRepo(pool).GetDailyUsage(ctx, userID, date)
	if err != nil || usage == nil || usage.ReservedSendCount != 1 || usage.FailedSendCount != 0 {
		t.Fatalf("usage=%+v err=%v", usage, err)
	}
	if stats, err := runner.RunOnce(ctx); err != nil || stats.Scanned != 0 {
		t.Fatalf("requeued intent was scanned again: stats=%+v err=%v", stats, err)
	}
}
