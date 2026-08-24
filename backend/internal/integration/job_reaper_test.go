package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/scheduler"
)

func TestGenericJobLeaseReaperClosesExpiredBinding(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	accounts := postgres.NewAccountRepo(pool)
	accountRow := &account.Account{
		PublicID: uuid.New(), UserID: userID, BindingStatus: account.BindingBinding,
		SessionStatus: account.SessionUnknown, RiskStatus: account.RiskNormal,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := accounts.Create(ctx, accountRow); err != nil {
		t.Fatal(err)
	}

	userRef, accountRef := userID, accountRow.ID
	jobs := postgres.NewJobRepo(pool)
	jobRow := &job.Job{
		PublicID: uuid.New(), UserID: &userRef, AccountID: &accountRef,
		Type: "account.bind.qr", Status: job.StatusQueued, Cancelable: true, CreatedAt: time.Now(),
	}
	if err := jobs.CreateJob(ctx, jobRow); err != nil {
		t.Fatal(err)
	}
	if claimed, err := jobs.Claim(ctx, jobRow.PublicID, "integration-expired-worker", -time.Minute); err != nil || claimed == nil {
		t.Fatalf("claim expired job: job=%+v err=%v", claimed, err)
	}

	reaper := scheduler.NewJobLeaseReaper(jobs, accounts, newTx(), 10)
	count, err := reaper.RunOnce(ctx)
	if err != nil || count != 1 {
		t.Fatalf("reaper count=%d err=%v", count, err)
	}
	finished, err := jobs.GetOwned(ctx, &userID, jobRow.PublicID)
	if err != nil || finished.Status != job.StatusFailed || finished.ErrorCode == nil || *finished.ErrorCode != apperr.CodeOutcomeUnknown {
		t.Fatalf("finished job=%+v err=%v", finished, err)
	}
	cleaned, err := accounts.GetByID(ctx, accountRow.ID)
	if err != nil || cleaned.BindingStatus != account.BindingUnbound {
		t.Fatalf("binding account=%+v err=%v", cleaned, err)
	}
	events, err := jobs.ListEvents(ctx, jobRow.ID)
	if err != nil || len(events) != 1 || events[0].EventType != "error" {
		t.Fatalf("events=%+v err=%v", events, err)
	}
}
