package asynqworker

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
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

var _ account.Repository = (*bindAccountRepoStub)(nil)
