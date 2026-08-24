package asynqworker

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

type bindTxContextKey struct{}

type bindTxStub struct{}

func (bindTxStub) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(context.WithValue(ctx, bindTxContextKey{}, true))
}

type bindJobRepoStub struct {
	operations []string
}

func (r *bindJobRepoStub) CreateJob(ctx context.Context, _ *job.Job) error {
	r.operations = append(r.operations, bindOperation(ctx, "create_job"))
	return nil
}
func (r *bindJobRepoStub) GetOwned(context.Context, *int64, uuid.UUID) (*job.Job, error) {
	return nil, nil
}
func (r *bindJobRepoStub) Claim(context.Context, uuid.UUID, string, time.Duration) (*job.Job, error) {
	return nil, nil
}
func (r *bindJobRepoStub) Heartbeat(context.Context, int64, string, time.Duration) error { return nil }
func (r *bindJobRepoStub) MarkWaiting(context.Context, int64, time.Duration) error       { return nil }
func (r *bindJobRepoStub) Finish(ctx context.Context, _ int64, _ job.Status, _ *string, _ time.Time) error {
	r.operations = append(r.operations, bindOperation(ctx, "finish"))
	return nil
}
func (r *bindJobRepoStub) IsCancelRequested(context.Context, int64) (bool, error) { return false, nil }
func (r *bindJobRepoStub) ListEvents(context.Context, int64) ([]job.JobEvent, error) {
	return nil, nil
}
func (r *bindJobRepoStub) AppendEvent(ctx context.Context, _ int64, event job.JobEvent) error {
	r.operations = append(r.operations, bindOperation(ctx, "event:"+event.EventType))
	return nil
}
func (r *bindJobRepoStub) RequestCancel(context.Context, int64, time.Time) error { return nil }

type bindAccountRepoStub struct {
	operations []string
}

func (r *bindAccountRepoStub) ListOwned(context.Context, int64) ([]*account.Account, error) {
	return nil, nil
}
func (r *bindAccountRepoStub) GetOwned(context.Context, int64, uuid.UUID) (*account.Account, error) {
	return nil, nil
}
func (r *bindAccountRepoStub) GetByID(context.Context, int64) (*account.Account, error) {
	return nil, nil
}
func (r *bindAccountRepoStub) Create(context.Context, *account.Account) error { return nil }
func (r *bindAccountRepoStub) SetBindingStatus(ctx context.Context, _ int64, _ account.BindingStatus) error {
	r.operations = append(r.operations, bindOperation(ctx, "binding"))
	return nil
}
func (r *bindAccountRepoStub) SetIdentity(ctx context.Context, _ int64, _, _ string, _ *string) error {
	r.operations = append(r.operations, bindOperation(ctx, "identity"))
	return nil
}
func (r *bindAccountRepoStub) SetPaused(context.Context, int64, *time.Time) error { return nil }
func (r *bindAccountRepoStub) SetRiskStatus(context.Context, int64, account.RiskStatus, *time.Time) error {
	return nil
}
func (r *bindAccountRepoStub) SetSessionStatus(ctx context.Context, _ int64, _ account.SessionStatus, _ time.Time) error {
	r.operations = append(r.operations, bindOperation(ctx, "session"))
	return nil
}
func (r *bindAccountRepoStub) SetLastFriendSyncAt(context.Context, int64, time.Time) error {
	return nil
}
func (r *bindAccountRepoStub) SoftDelete(context.Context, int64) error                { return nil }
func (r *bindAccountRepoStub) CountQuotaOccupied(context.Context, int64) (int, error) { return 0, nil }

type bindOutboxStub struct {
	operations []string
}

func (r *bindOutboxStub) Add(ctx context.Context, message outbox.Message) error {
	r.operations = append(r.operations, bindOperation(ctx, "outbox:"+message.Kind))
	return nil
}

type bindSessionStub struct {
	operations []string
}

func (r *bindSessionStub) Store(ctx context.Context, _ int64, _, _ uuid.UUID, _ []byte) error {
	r.operations = append(r.operations, bindOperation(ctx, "store"))
	return nil
}
func (r *bindSessionStub) StoreInTx(ctx context.Context, _ int64, _, _ uuid.UUID, _ []byte) error {
	r.operations = append(r.operations, bindOperation(ctx, "store_in_tx"))
	return nil
}
func (r *bindSessionStub) WithTempFile(context.Context, int64, uuid.UUID, uuid.UUID, func(string) error) error {
	return nil
}

func bindOperation(ctx context.Context, operation string) string {
	if ctx.Value(bindTxContextKey{}) == true {
		return "tx:" + operation
	}
	return "outside:" + operation
}

func TestQRResultDecoders(t *testing.T) {
	response := &sidecar.Response{
		ProtocolVersion: sidecar.ProtocolVersion,
		OK:              true,
		Result: map[string]any{
			"login_handle": "qr_test",
			"qr":           map[string]any{"format": "data_url", "value": "data:image/png;base64,opaque"},
		},
	}
	var result qrStartResult
	if err := decodeResult(response, &result); err != nil {
		t.Fatal(err)
	}
	if result.LoginHandle != "qr_test" || result.QR.Value == "" {
		t.Fatalf("unexpected QR result: %+v", result)
	}

	bad := &sidecar.Response{OK: false, Error: &sidecar.Error{Code: sidecar.ErrQRExpired}}
	if got := sidecarErrorCode(bad); got != sidecar.ErrQRExpired {
		t.Fatalf("error code = %q", got)
	}
	if got := mapSidecarError(sidecar.ErrQRExpired); got != apperr.CodeQRExpired {
		t.Fatalf("mapped QR expiry = %q", got)
	}
	if got := mapSidecarError(sidecar.ErrSMSCodeExpired); got != apperr.CodeSMSExpired {
		t.Fatalf("mapped SMS expiry = %q", got)
	}
}

func TestSleepContextStopsOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := sleepContext(ctx, time.Second); err == nil {
		t.Fatal("expected cancellation")
	}
}

func TestMustJSONIsSafeForJobEvents(t *testing.T) {
	payload := mustJSON(map[string]string{"code": apperr.CodeChallengeRequired})
	var decoded map[string]string
	if err := json.Unmarshal(payload, &decoded); err != nil || decoded["code"] != apperr.CodeChallengeRequired {
		t.Fatalf("invalid event payload: %s", payload)
	}
}

func TestCompleteBindFinalizesJobBeforeAccountAndOutboxCommit(t *testing.T) {
	jobs := &bindJobRepoStub{}
	accounts := &bindAccountRepoStub{}
	relay := &bindOutboxStub{}
	sessions := &bindSessionStub{}
	now := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	deps := QRBindDeps{
		Jobs: jobs, Accounts: accounts, Sessions: sessions, Tx: bindTxStub{}, Outbox: relay,
		Now: func() time.Time { return now },
	}
	claimed := &job.Job{ID: 10, PublicID: uuid.New(), Status: job.StatusWaiting}
	acct := &account.Account{ID: 20, PublicID: uuid.New(), UserID: 30}
	identity := bindIdentity{PlatformUserID: "platform-user", Nickname: "昵称"}

	if err := commitBindSuccess(context.Background(), deps, claimed, acct, identity, []byte(`{"cookies":[]}`)); err != nil {
		t.Fatalf("commitBindSuccess() error = %v", err)
	}
	if len(jobs.operations) < 3 || jobs.operations[0] != "tx:finish" {
		t.Fatalf("job operations = %#v, want transaction finish first", jobs.operations)
	}
	for _, operation := range append(append(accounts.operations, relay.operations...), sessions.operations...) {
		if len(operation) < len("tx:") || operation[:len("tx:")] != "tx:" {
			t.Fatalf("side effect escaped completion transaction: %q", operation)
		}
	}
	if len(relay.operations) != 2 {
		t.Fatalf("outbox operations = %#v, want friends sync and capability probe", relay.operations)
	}
}
