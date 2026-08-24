package integration

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/cryptox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/session"
)

func TestAccountSessionRoundTripAndJobClaim(t *testing.T) {
	ctx := context.Background()
	userID := newUser(t)
	users := postgres.NewAuthUserRepo(pool)
	user, err := users.GetUserByID(ctx, userID)
	if err != nil {
		t.Fatal(err)
	}

	accounts := postgres.NewAccountRepo(pool)
	acct := &account.Account{
		PublicID: uuid.New(), UserID: userID, BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := accounts.Create(ctx, acct); err != nil {
		t.Fatal(err)
	}
	loaded, err := accounts.GetByID(ctx, acct.ID)
	if err != nil || loaded.UserPublicID != user.PublicID {
		t.Fatalf("account lookup did not include user public id: err=%v account=%+v", err, loaded)
	}

	cipher, err := cryptox.NewCipherFromHexKey("0000000000000000000000000000000000000000000000000000000000000000")
	if err != nil {
		t.Fatal(err)
	}
	sessions := session.NewService(postgres.NewSessionRepo(pool), postgres.NewTxManager(pool), cipher, t.TempDir())
	state := []byte(`{"cookies":[{"name":"sessionid","value":"opaque"}]}`)
	if err := sessions.Store(ctx, acct.ID, user.PublicID, acct.PublicID, state); err != nil {
		t.Fatalf("store session: %v", err)
	}
	var tempState []byte
	if err := sessions.WithTempFile(ctx, acct.ID, user.PublicID, acct.PublicID, func(path string) error {
		var err error
		tempState, err = os.ReadFile(path)
		return err
	}); err != nil {
		t.Fatalf("open session temp file: %v", err)
	}
	if string(tempState) != string(state) {
		t.Fatalf("session plaintext mismatch: %s", tempState)
	}

	jobs := postgres.NewJobRepo(pool)
	userRef := userID
	accountRef := acct.ID
	j := &job.Job{PublicID: uuid.New(), UserID: &userRef, AccountID: &accountRef,
		Type: "account.session_check.browser", Status: job.StatusQueued, CreatedAt: time.Now()}
	if err := jobs.CreateJob(ctx, j); err != nil {
		t.Fatal(err)
	}
	claimed, err := jobs.Claim(ctx, j.PublicID, "integration-worker", 90*time.Second)
	if err != nil || claimed == nil || claimed.Status != job.StatusRunning {
		t.Fatalf("claim failed: err=%v job=%+v", err, claimed)
	}
	second, err := jobs.Claim(ctx, j.PublicID, "duplicate-worker", 90*time.Second)
	if err != nil || second != nil {
		t.Fatalf("duplicate claim should be absorbed: err=%v job=%+v", err, second)
	}
	if err := jobs.MarkWaiting(ctx, j.ID, 90*time.Second); err != nil {
		t.Fatalf("mark waiting failed: %v", err)
	}
	if waiting, err := jobs.GetOwned(ctx, &userID, j.PublicID); err != nil || waiting.Status != job.StatusWaiting {
		t.Fatalf("waiting state was not persisted: err=%v job=%+v", err, waiting)
	}
	platformID := "integration-" + uuid.NewString()
	if err := accounts.SetIdentity(ctx, acct.ID, platformID, "Integration User", nil); err != nil {
		t.Fatalf("set identity: %v", err)
	}
	loaded, err = accounts.GetByID(ctx, acct.ID)
	if err != nil || loaded.PlatformUserID == nil || *loaded.PlatformUserID != platformID || loaded.Nickname != "Integration User" {
		t.Fatalf("identity was not persisted: err=%v account=%+v", err, loaded)
	}
	payload, _ := json.Marshal(map[string]bool{"valid": true})
	if err := jobs.AppendEvent(ctx, j.ID, job.JobEvent{EventType: "success", Payload: payload, CreatedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	if err := jobs.Finish(ctx, j.ID, job.StatusSucceeded, nil, time.Now()); err != nil {
		t.Fatal(err)
	}
	finished, err := jobs.GetOwned(ctx, &userID, j.PublicID)
	if err != nil || finished.Status != job.StatusSucceeded {
		t.Fatalf("finish failed: err=%v job=%+v", err, finished)
	}
}
