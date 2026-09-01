package asynqworker

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

type friendSyncStub struct {
	operations []string
}

func (r *friendSyncStub) SyncBatch(ctx context.Context, _ int64, _ []friend.SyncItem, _, _ []string, _ time.Time) error {
	r.operations = append(r.operations, bindOperation(ctx, "friends"))
	return nil
}

type transactionalRiskStub struct {
	operations []string
}

type metricRiskStub struct {
	transactionalRiskStub
	metrics []string
}

func (r *metricRiskStub) ObserveMetrics(code string) {
	r.metrics = append(r.metrics, code)
}

type sendTerminalRepoStub struct {
	send.Repository
	operations []string
}

func (r *sendTerminalRepoStub) FinishJob(ctx context.Context, _ int64, _ send.JobStatus, _ *string, _ bool, _ *string, _ time.Time) error {
	r.operations = append(r.operations, bindOperation(ctx, "send_finish"))
	return nil
}

func (r *sendTerminalRepoStub) SetIntentStatus(ctx context.Context, _ int64, _ send.IntentStatus, _ *string, _ *time.Time, _ time.Time) error {
	r.operations = append(r.operations, bindOperation(ctx, "intent_status"))
	return nil
}

func (r *transactionalRiskStub) Apply(context.Context, int64, string, string, map[string]any) error {
	return nil
}

func (r *transactionalRiskStub) ApplyInTx(ctx context.Context, _ int64, _, _ string, _ map[string]any) error {
	r.operations = append(r.operations, bindOperation(ctx, "risk"))
	return nil
}

func TestCommitFriendsSyncSuccessFinalizesJobBeforeSnapshot(t *testing.T) {
	j := &bindJobRepoStub{}
	accounts := &bindAccountRepoStub{}
	friends := &friendSyncStub{}
	now := func() time.Time { return time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC) }
	claimed := &job.Job{ID: 10, PublicID: uuid.New(), Status: job.StatusRunning}

	if err := commitFriendsSyncSuccess(context.Background(), bindTxStub{}, j, friends, accounts,
		claimed, 20, []friend.SyncItem{{IdentityStatus: friend.IdentityPending}}, nil, nil, now); err != nil {
		t.Fatal(err)
	}
	if len(j.operations) == 0 || j.operations[0] != "tx:finish" {
		t.Fatalf("job operations = %#v, want transaction finish first", j.operations)
	}
	for _, operation := range append(append(j.operations, friends.operations...), accounts.operations...) {
		if len(operation) < len("tx:") || operation[:len("tx:")] != "tx:" {
			t.Fatalf("friend sync side effect escaped completion transaction: %q", operation)
		}
	}
}

func TestCommitSessionCheckSuccessFinalizesJobBeforeSessionState(t *testing.T) {
	j := &bindJobRepoStub{}
	accounts := &bindAccountRepoStub{}
	now := func() time.Time { return time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC) }
	claimed := &job.Job{ID: 11, PublicID: uuid.New(), Status: job.StatusRunning}

	if err := commitSessionCheckSuccess(context.Background(), bindTxStub{}, j, accounts, claimed, 20, now); err != nil {
		t.Fatal(err)
	}
	if len(j.operations) == 0 || j.operations[0] != "tx:finish" {
		t.Fatalf("job operations = %#v, want transaction finish first", j.operations)
	}
	for _, operation := range append(j.operations, accounts.operations...) {
		if len(operation) < len("tx:") || operation[:len("tx:")] != "tx:" {
			t.Fatalf("session check side effect escaped completion transaction: %q", operation)
		}
	}
}

func TestCommitWorkerFailureFinalizesJobBeforeRiskProjection(t *testing.T) {
	j := &bindJobRepoStub{}
	risk := &transactionalRiskStub{}
	now := func() time.Time { return time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC) }
	claimed := &job.Job{ID: 12, PublicID: uuid.New(), Status: job.StatusRunning}

	if err := commitWorkerFailure(context.Background(), bindTxStub{}, j, risk, claimed, 20,
		"SESSION_EXPIRED", "browser.consumer", claimed.PublicID.String(), nil, now); err != nil {
		t.Fatal(err)
	}
	if len(j.operations) == 0 || j.operations[0] != "tx:finish" {
		t.Fatalf("job operations = %#v, want transaction finish first", j.operations)
	}
	for _, operation := range append(j.operations, risk.operations...) {
		if len(operation) < len("tx:") || operation[:len("tx:")] != "tx:" {
			t.Fatalf("risk failure side effect escaped completion transaction: %q", operation)
		}
	}
}

func TestCommitWorkerFailureCountsRiskOnlyAfterCommit(t *testing.T) {
	j := &bindJobRepoStub{}
	risk := &metricRiskStub{}
	now := func() time.Time { return time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC) }
	claimed := &job.Job{ID: 16, PublicID: uuid.New(), Status: job.StatusRunning}

	if err := commitWorkerFailure(context.Background(), bindTxStub{}, j, risk, claimed, 20,
		"SESSION_EXPIRED", "browser.consumer", claimed.PublicID.String(), nil, now); err != nil {
		t.Fatal(err)
	}
	if len(risk.metrics) != 1 || risk.metrics[0] != "SESSION_EXPIRED" {
		t.Fatalf("risk metrics = %#v, want one post-commit observation", risk.metrics)
	}
}

func TestFinishBindRiskFailureKeepsChallengeEventAndRiskInJobTx(t *testing.T) {
	j := &bindJobRepoStub{}
	risk := &transactionalRiskStub{}
	now := func() time.Time { return time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC) }
	claimed := &job.Job{ID: 13, PublicID: uuid.New(), Status: job.StatusWaiting}
	deps := QRBindDeps{Jobs: j, Accounts: &bindAccountRepoStub{}, Tx: bindTxStub{}, Risk: risk, Now: now}

	if err := finishBindRiskFailure(context.Background(), deps, claimed, 20, "CHALLENGE_REQUIRED", job.JobEvent{
		EventType: "challenge_required", Payload: []byte(`{}`), CreatedAt: now(),
	}); err != nil {
		t.Fatal(err)
	}
	if len(j.operations) == 0 || j.operations[0] != "tx:finish" {
		t.Fatalf("job operations = %#v, want transaction finish first", j.operations)
	}
	for _, operation := range append(j.operations, risk.operations...) {
		if len(operation) < len("tx:") || operation[:len("tx:")] != "tx:" {
			t.Fatalf("binding failure side effect escaped completion transaction: %q", operation)
		}
	}
}

func TestFinishBindRiskFailureRemovesInitialBindingPlaceholder(t *testing.T) {
	j := &bindJobRepoStub{}
	accounts := &bindAccountRepoStub{account: &account.Account{ID: 20, BindingStatus: account.BindingBinding}}
	risk := &transactionalRiskStub{}
	now := func() time.Time { return time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC) }
	accountID := int64(20)
	claimed := &job.Job{ID: 17, PublicID: uuid.New(), AccountID: &accountID, Type: "account.bind.qr", Status: job.StatusRunning}
	deps := QRBindDeps{Jobs: j, Accounts: accounts, Tx: bindTxStub{}, Risk: risk, Now: now}

	if err := finishBindRiskFailure(context.Background(), deps, claimed, 20, "ADAPTER_UNAVAILABLE"); err != nil {
		t.Fatal(err)
	}
	if len(accounts.operations) != 1 || accounts.operations[0] != "tx:soft_delete" {
		t.Fatalf("account operations = %#v, want transactional placeholder removal", accounts.operations)
	}
}

func TestFinishRebindRiskFailureDoesNotProjectOntoOldSession(t *testing.T) {
	j := &bindJobRepoStub{}
	risk := &transactionalRiskStub{}
	now := func() time.Time { return time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC) }
	claimed := &job.Job{ID: 14, PublicID: uuid.New(), Type: "account.relogin.qr", Status: job.StatusWaiting}
	deps := QRBindDeps{Jobs: j, Accounts: &bindAccountRepoStub{}, Tx: bindTxStub{}, Risk: risk, Now: now}

	if err := finishBindRiskFailure(context.Background(), deps, claimed, 20, "CHALLENGE_REQUIRED"); err != nil {
		t.Fatal(err)
	}
	if len(risk.operations) != 0 {
		t.Fatalf("re-login failure projected risk onto the old account: %#v", risk.operations)
	}
	if len(j.operations) < 2 || j.operations[0] != "tx:finish" || j.operations[len(j.operations)-1] != "tx:event:error" {
		t.Fatalf("job operations = %#v, want terminal error event", j.operations)
	}
}

func TestFinishSendRiskFailureKeepsSendStateAndRiskInJobTx(t *testing.T) {
	sends := &sendTerminalRepoStub{}
	risk := &transactionalRiskStub{}
	claimed := &send.SendJob{ID: 14, PublicID: uuid.New(), IntentID: 24, AccountID: 34, FriendID: 44}
	now := func() time.Time { return time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC) }

	if err := finishSendWithRiskAndQuota(context.Background(), SessionCheckDeps{
		Sends: sends, Tx: bindTxStub{}, Risk: risk,
	}, claimed, send.JobFailed, "SESSION_EXPIRED", false, nil, send.IntentFailed,
		55, nil, now, "browser.consumer", "SESSION_EXPIRED", nil); err != nil {
		t.Fatal(err)
	}
	if len(sends.operations) == 0 || sends.operations[0] != "tx:send_finish" {
		t.Fatalf("send operations = %#v, want send finish first", sends.operations)
	}
	for _, operation := range append(sends.operations, risk.operations...) {
		if len(operation) < len("tx:") || operation[:len("tx:")] != "tx:" {
			t.Fatalf("send failure side effect escaped completion transaction: %q", operation)
		}
	}
}

func TestFinishSendRetryWithRiskKeepsRetryStateAndRiskInJobTx(t *testing.T) {
	sends := &sendTerminalRepoStub{}
	risk := &transactionalRiskStub{}
	claimed := &send.SendJob{ID: 15, PublicID: uuid.New(), IntentID: 25, AccountID: 35, FriendID: 45}
	now := func() time.Time { return time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC) }

	if err := finishSendRetryWithRisk(context.Background(), SessionCheckDeps{
		Sends: sends, Tx: bindTxStub{}, Risk: risk,
	}, claimed, "NETWORK_TIMEOUT", now().Add(time.Minute), now, "browser.consumer", "NETWORK_TIMEOUT"); err != nil {
		t.Fatal(err)
	}
	if len(sends.operations) == 0 || sends.operations[0] != "tx:send_finish" {
		t.Fatalf("send retry operations = %#v, want transaction finish first", sends.operations)
	}
	for _, operation := range append(sends.operations, risk.operations...) {
		if len(operation) < len("tx:") || operation[:len("tx:")] != "tx:" {
			t.Fatalf("send retry side effect escaped completion transaction: %q", operation)
		}
	}
}

var _ account.Repository = (*bindAccountRepoStub)(nil)
