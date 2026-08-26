package integration

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

func TestManualIntentIdempotencyKeyHasOneWinnerAndReplaysJob(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	base := time.Now().UTC().Truncate(time.Microsecond)
	acct := &account.Account{
		PublicID: uuid.New(), UserID: userID, BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: base, UpdatedAt: base,
	}
	if err := postgres.NewAccountRepo(pool).Create(ctx, acct); err != nil {
		t.Fatal(err)
	}
	var friendID int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO friends (public_id, account_id, platform_user_id, identity_status, display_name, nickname)
		VALUES ($1,$2,$3,'resolved','幂等好友','幂等好友') RETURNING id`,
		uuid.New(), acct.ID, "send-idempotency-"+uuid.NewString()).Scan(&friendID); err != nil {
		t.Fatal(err)
	}

	requestID := uuid.New()
	repo := postgres.NewSendRepo(pool)
	makeIntent := func(publicID uuid.UUID) *send.SendIntent {
		return &send.SendIntent{
			PublicID: publicID, IntentType: send.IntentManual, RequestID: &requestID,
			AccountID: acct.ID, FriendID: friendID, ScheduledAt: base,
			Status: send.IntentQueued, CreatedAt: base, UpdatedAt: base,
			MessageKind: func() *string { value := "text"; return &value }(),
			MessageBody: func() *string { value := "幂等测试"; return &value }(),
		}
	}
	items := []*send.SendIntent{makeIntent(uuid.New()), makeIntent(uuid.New())}
	type insertResult struct {
		item *send.SendIntent
		err  error
	}
	results := make(chan insertResult, len(items))
	var wg sync.WaitGroup
	for _, item := range items {
		wg.Add(1)
		go func(item *send.SendIntent) {
			defer wg.Done()
			results <- insertResult{item: item, err: repo.CreateIntent(ctx, item)}
		}(item)
	}
	wg.Wait()
	close(results)

	var winner *send.SendIntent
	var conflicts int
	for result := range results {
		if result.err == nil {
			winner = result.item
			continue
		}
		if errors.Is(result.err, send.ErrIntentIdempotencyConflict) {
			conflicts++
			continue
		}
		t.Fatalf("unexpected concurrent insert error: %v", result.err)
	}
	if winner == nil || conflicts != 1 {
		t.Fatalf("request key winners=%+v conflicts=%d", winner, conflicts)
	}

	job := &send.SendJob{PublicID: uuid.New(), IntentID: winner.ID, AccountID: acct.ID, FriendID: friendID,
		Attempt: 1, Status: send.JobQueued, CreatedAt: base}
	if err := repo.CreateJob(ctx, job); err != nil {
		t.Fatal(err)
	}
	if err := repo.SetIntentLastJob(ctx, winner.ID, job.ID); err != nil {
		t.Fatal(err)
	}
	replayed, replayedJob, err := repo.GetManualIntentByRequestIDOwned(ctx, userID, requestID)
	if err != nil || replayed == nil || replayedJob == nil {
		t.Fatalf("replay lookup failed: intent=%+v job=%+v err=%v", replayed, replayedJob, err)
	}
	if replayed.PublicID != winner.PublicID || replayedJob.PublicID != job.PublicID || replayed.RequestID == nil || *replayed.RequestID != requestID {
		t.Fatalf("replay returned different durable response: intent=%+v job=%+v", replayed, replayedJob)
	}
}
