package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAccountReleaseStopsFutureWorkAndRevokesSession(t *testing.T) {
	ctx := context.Background()
	ownerID := newUser(t)
	now := time.Now()
	accounts := postgres.NewAccountRepo(pool)
	acct := &account.Account{
		PublicID: uuid.New(), UserID: ownerID, Nickname: "待解绑账号",
		BindingStatus: account.BindingBound, SessionStatus: account.SessionValid,
		RiskStatus: account.RiskNormal, CreatedAt: now, UpdatedAt: now,
	}
	if err := accounts.Create(ctx, acct); err != nil {
		t.Fatal(err)
	}

	if _, err := pool.Exec(ctx, `
		INSERT INTO account_sessions (account_id, version, key_version, cipher_alg, ciphertext, created_at)
		VALUES ($1, 1, 1, 'AES-256-GCM', $2, $3)`, acct.ID, []byte("encrypted"), now); err != nil {
		t.Fatal(err)
	}
	friendID := uuid.New()
	var friendRowID int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO friends (public_id, account_id, platform_user_id, identity_status, display_name, nickname, spark_enabled)
		VALUES ($1,$2,$3,'resolved','解绑测试好友','解绑测试好友',true)
		RETURNING id`, friendID, acct.ID, "release-platform-"+uuid.NewString()).Scan(&friendRowID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO spark_tasks (public_id, user_id, account_id, friend_id, enabled, window_start, window_end, message_kind, message_body)
		VALUES ($1,$2,$3,$4,true,'19:00','20:00','text','测试消息')`, uuid.New(), ownerID, acct.ID, friendRowID); err != nil {
		t.Fatal(err)
	}
	intentID := uuid.New()
	requestID := uuid.New()
	var intentRowID int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO send_intents (public_id, intent_type, request_id, account_id, friend_id, scheduled_at, status)
		VALUES ($1,'manual',$2,$3,$4,$5,'queued')
		RETURNING id`, intentID, requestID, acct.ID, friendRowID, now).Scan(&intentRowID); err != nil {
		t.Fatal(err)
	}
	var sendJobID int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO send_jobs (public_id, intent_id, account_id, friend_id, attempt, status)
		VALUES ($1,$2,$3,$4,1,'queued')
		RETURNING id`, uuid.New(), intentRowID, acct.ID, friendRowID).Scan(&sendJobID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE send_intents SET last_job_id=$2 WHERE id=$1`, intentRowID, sendJobID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO jobs (public_id, user_id, account_id, type, status, cancelable)
		VALUES ($1,$2,$3,'account.session_check.browser','queued',true)`, uuid.New(), ownerID, acct.ID); err != nil {
		t.Fatal(err)
	}

	if err := newTx().WithinTx(ctx, func(tctx context.Context) error { return accounts.SoftDelete(tctx, acct.ID) }); err != nil {
		t.Fatal(err)
	}

	var bindingStatus string
	var deletedAt *time.Time
	if err := queryRow(t, `SELECT binding_status, deleted_at FROM douyin_accounts WHERE id=$1`, acct.ID).Scan(&bindingStatus, &deletedAt); err != nil {
		t.Fatal(err)
	}
	if bindingStatus != string(account.BindingReleased) || deletedAt == nil {
		t.Fatalf("account release state = %q, %v", bindingStatus, deletedAt)
	}
	var sessionRevokedAt *time.Time
	if err := queryRow(t, `SELECT revoked_at FROM account_sessions WHERE account_id=$1`, acct.ID).Scan(&sessionRevokedAt); err != nil {
		t.Fatal(err)
	}
	if sessionRevokedAt == nil {
		t.Fatal("account session should be revoked")
	}
	var taskEnabled bool
	if err := queryRow(t, `SELECT enabled FROM spark_tasks WHERE account_id=$1`, acct.ID).Scan(&taskEnabled); err != nil {
		t.Fatal(err)
	}
	if taskEnabled {
		t.Fatal("account tasks should be disabled")
	}
	var intentStatus, intentCode string
	if err := queryRow(t, `SELECT status, error_code FROM send_intents WHERE id=$1`, intentRowID).Scan(&intentStatus, &intentCode); err != nil {
		t.Fatal(err)
	}
	if intentStatus != "cancelled" || intentCode != "ACCOUNT_RELEASED" {
		t.Fatalf("future intent = %q/%q", intentStatus, intentCode)
	}
	var sendJobStatus, sendJobCode string
	if err := queryRow(t, `SELECT status, error_code FROM send_jobs WHERE id=$1`, sendJobID).Scan(&sendJobStatus, &sendJobCode); err != nil {
		t.Fatal(err)
	}
	if sendJobStatus != "cancelled" || sendJobCode != "ACCOUNT_RELEASED" {
		t.Fatalf("queued send job = %q/%q", sendJobStatus, sendJobCode)
	}
	var cancelRequestedAt *time.Time
	if err := queryRow(t, `SELECT cancel_requested_at FROM jobs WHERE account_id=$1`, acct.ID).Scan(&cancelRequestedAt); err != nil {
		t.Fatal(err)
	}
	if cancelRequestedAt == nil {
		t.Fatal("account job should receive a cancellation request")
	}
}
