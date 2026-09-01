package asynqworker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
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
	account    *account.Account
}

func (r *bindAccountRepoStub) ListOwned(context.Context, int64) ([]*account.Account, error) {
	return nil, nil
}
func (r *bindAccountRepoStub) GetOwned(context.Context, int64, uuid.UUID) (*account.Account, error) {
	return nil, nil
}
func (r *bindAccountRepoStub) GetByID(context.Context, int64) (*account.Account, error) {
	return r.account, nil
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
func (r *bindAccountRepoStub) SetLastFriendSyncAt(ctx context.Context, _ int64, _ time.Time) error {
	r.operations = append(r.operations, bindOperation(ctx, "last_friend_sync"))
	return nil
}
func (r *bindAccountRepoStub) SoftDelete(ctx context.Context, _ int64) error {
	r.operations = append(r.operations, bindOperation(ctx, "soft_delete"))
	return nil
}
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

type qrStartRecoveryStub struct {
	closed   bool
	calls    int
	closeErr error
}

func (s *qrStartRecoveryStub) Call(context.Context, sidecar.Request) (*sidecar.Response, error) {
	s.calls++
	if !s.closed {
		return &sidecar.Response{OK: false, Error: &sidecar.Error{Code: sidecar.ErrInternal}}, nil
	}
	return &sidecar.Response{OK: true, Result: map[string]any{
		"login_handle": "qr-recovered",
		"qr":           map[string]any{"format": "data_url", "value": "data:image/png;base64:test"},
	}}, nil
}

func (s *qrStartRecoveryStub) Close() error {
	s.closed = true
	return s.closeErr
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

	challengeResponse := &sidecar.Response{
		ProtocolVersion: sidecar.ProtocolVersion,
		OK:              true,
		Result: map[string]any{
			"state":        "challenge_required",
			"login_handle": "qr_challenge",
			"qr":           map[string]any{"format": "none", "value": "", "expires_at": "2026-08-25T13:00:00Z"},
		},
	}
	var challenge qrStartResult
	if err := decodeResult(challengeResponse, &challenge); err != nil {
		t.Fatal(err)
	}
	if challenge.State != "challenge_required" || challenge.LoginHandle != "qr_challenge" {
		t.Fatalf("unexpected challenge result: %+v", challenge)
	}

	smsExpiry := time.Date(2026, 8, 25, 13, 5, 0, 0, time.UTC)
	smsResponse := &sidecar.Response{OK: true, Result: map[string]any{
		"state": "sms_code_required", "expires_at": smsExpiry.Format(time.RFC3339),
	}}
	var smsRequired qrPollResult
	if err := decodeResult(smsResponse, &smsRequired); err != nil {
		t.Fatal(err)
	}
	if smsRequired.State != "sms_code_required" || !smsRequired.ExpiresAt.Equal(smsExpiry) {
		t.Fatalf("unexpected QR SMS result: %+v", smsRequired)
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

func TestQRStartRecoversFromStaleSidecarRuntime(t *testing.T) {
	stub := &qrStartRecoveryStub{}
	response, err := startQRWithRecovery(context.Background(), stub, sidecar.Request{
		ProtocolVersion: sidecar.ProtocolVersion,
		RequestID:       uuid.New().String(),
		Op:              sidecar.OpsLoginQRStart,
		DeadlineMS:      60_000,
		Input:           map[string]any{"profile_dir": "/tmp/qr-test", "locale": "zh-CN"},
	})
	if err != nil {
		t.Fatalf("startQRWithRecovery() error = %v", err)
	}
	if response == nil || !response.OK || stub.calls != 2 || !stub.closed {
		t.Fatalf("response = %#v, calls = %d, closed = %t", response, stub.calls, stub.closed)
	}
}

func TestQRStartInputForcesFreshLoginOnlyForRebinds(t *testing.T) {
	newBinding := qrStartInput("/tmp/qr-profile", false)
	if newBinding["force_login"] != false || newBinding["profile_dir"] != "/tmp/qr-profile" {
		t.Fatalf("new binding input = %+v", newBinding)
	}
	relogin := qrStartInput("/tmp/qr-profile", true)
	if relogin["force_login"] != true {
		t.Fatalf("re-login input did not force a fresh login: %+v", relogin)
	}
}

func TestQRPollDeadlineAllowsAuthenticatedSessionFinalization(t *testing.T) {
	if qrPollDeadlineMS < 30_000 {
		t.Fatalf("QR poll deadline = %dms; authenticated session validation and identity resolution need at least 30s", qrPollDeadlineMS)
	}
}

func TestQRStartRecoveryReportsResetCloseErrors(t *testing.T) {
	var logs bytes.Buffer
	ctx := telemetry.WithContext(context.Background(), slog.New(slog.NewTextHandler(&logs, nil)))
	stub := &qrStartRecoveryStub{closeErr: errors.New("sidecar close failed")}

	response, err := startQRWithRecovery(ctx, stub, sidecar.Request{
		ProtocolVersion: sidecar.ProtocolVersion,
		RequestID:       uuid.New().String(),
		Op:              sidecar.OpsLoginQRStart,
		DeadlineMS:      60_000,
	})
	if err != nil || response == nil || !response.OK {
		t.Fatalf("startQRWithRecovery() response=%#v err=%v", response, err)
	}
	if !strings.Contains(logs.String(), "QR sidecar reset close failed") {
		t.Fatalf("reset close failure was not logged: %s", logs.String())
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

func TestRebindProtectsSessionAndAccountIdentityBoundaries(t *testing.T) {
	platformID := "platform-user"
	acct := &account.Account{PlatformUserID: &platformID}
	if !isRebindJob(&job.Job{Type: "account.relogin.qr"}) {
		t.Fatal("re-login job type should be recognized")
	}
	if isRebindJob(&job.Job{Type: "account.bind.qr"}) {
		t.Fatal("new binding job must not be treated as re-login")
	}
	if !rebindIdentityMatches(acct, bindIdentity{PlatformUserID: platformID}) {
		t.Fatal("same platform identity should be accepted")
	}
	if rebindIdentityMatches(acct, bindIdentity{PlatformUserID: "another-user"}) {
		t.Fatal("different platform identity must be rejected")
	}
	legacyID := strings.Repeat("a", 32)
	legacyAcct := &account.Account{PlatformUserID: &legacyID, Nickname: "昵称"}
	if !rebindIdentityMatches(legacyAcct, bindIdentity{PlatformUserID: "stable-user", Nickname: "昵称", IdentitySource: "response"}) {
		t.Fatal("matching page identity should migrate a legacy cookie identity")
	}
	if rebindIdentityMatches(legacyAcct, bindIdentity{PlatformUserID: "stable-user", Nickname: "其他账号", IdentitySource: "response"}) {
		t.Fatal("legacy migration must reject a different nickname")
	}
	if rebindIdentityMatches(legacyAcct, bindIdentity{PlatformUserID: "stable-user", Nickname: "昵称", IdentitySource: "cookie_fallback"}) {
		t.Fatal("legacy migration must not accept another cookie fallback")
	}
}

func TestCancelNewQRBindingRemovesPlaceholderAccount(t *testing.T) {
	requestedAt := time.Date(2026, 8, 31, 4, 0, 0, 0, time.UTC)
	accountID := int64(20)
	jobs := &bindJobRepoStub{}
	accounts := &bindAccountRepoStub{account: &account.Account{
		ID:            20,
		BindingStatus: account.BindingBinding,
	}}
	claimed := &job.Job{
		ID:                10,
		Type:              "account.bind.qr",
		AccountID:         &accountID,
		CancelRequestedAt: &requestedAt,
	}
	deps := QRBindDeps{Jobs: jobs, Accounts: accounts, Tx: bindTxStub{}, Now: func() time.Time { return requestedAt }}

	cancelled, err := cancelIfRequestedWithCleanup(
		context.Background(), jobs, deps.Tx, claimed, deps.Now, releaseInitialBinding(deps, claimed),
	)
	if err != nil || !cancelled {
		t.Fatalf("cancelled = %t, err = %v", cancelled, err)
	}
	if len(accounts.operations) != 1 || accounts.operations[0] != "tx:soft_delete" {
		t.Fatalf("account operations = %#v, want [tx:soft_delete]", accounts.operations)
	}
}

func TestCancelQRReloginKeepsExistingAccount(t *testing.T) {
	accountID := int64(20)
	accounts := &bindAccountRepoStub{account: &account.Account{
		ID:            accountID,
		BindingStatus: account.BindingBound,
	}}
	claimed := &job.Job{Type: "account.relogin.qr", AccountID: &accountID}
	deps := QRBindDeps{Accounts: accounts}

	if cleanup := releaseInitialBinding(deps, claimed); cleanup != nil {
		t.Fatal("re-login cancellation must not create an account cleanup callback")
	}
	if len(accounts.operations) != 0 {
		t.Fatalf("existing account was modified: %#v", accounts.operations)
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
