package asynqworker

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

func TestShouldRetrySendRequiresSidecarProofAndAllowlist(t *testing.T) {
	if shouldRetrySend(&sidecar.Response{OK: false, Error: &sidecar.Error{Code: sidecar.ErrAdapterUnavailable, Retryable: true}}) != true {
		t.Fatal("retryable adapter-unavailable response should retry")
	}
	if shouldRetrySend(&sidecar.Response{OK: false, Error: &sidecar.Error{Code: sidecar.ErrNetworkTimeout, Retryable: true}}) != true {
		t.Fatal("explicitly safe network timeout should retry")
	}
	if shouldRetrySend(&sidecar.Response{OK: false, Error: &sidecar.Error{Code: sidecar.ErrNetworkTimeout, Retryable: false}}) {
		t.Fatal("unknown network timeout must fail closed")
	}
	if shouldRetrySend(&sidecar.Response{OK: false, Error: &sidecar.Error{Code: sidecar.ErrAdapterIncompatible, Retryable: true}}) {
		t.Fatal("adapter incompatibility must not retry")
	}
}

func TestObserveSendMetricUsesTerminalStatus(t *testing.T) {
	metrics := telemetry.NewMetrics()
	observeSendMetric(metrics, capability.AdapterBrowserConsumer, string(send.IntentSucceeded))
	if !strings.Contains(metrics.Render(), `send_total{adapter="browser.consumer",status="succeeded"} 1`) {
		t.Fatalf("send metric missing terminal status:\n%s", metrics.Render())
	}
}

func TestSendRetryDelayMatchesDesignBackoff(t *testing.T) {
	if sendRetryDelay(1) != 30*time.Second || sendRetryDelay(2) != 2*time.Minute || sendRetryDelay(3) != 10*time.Minute {
		t.Fatalf("unexpected retry delays")
	}
}

func TestMapSendSidecarErrors(t *testing.T) {
	tests := map[string]string{
		sidecar.ErrSessionExpired:         apperr.CodeSessionExpired,
		sidecar.ErrChallengeRequired:      apperr.CodeChallengeRequired,
		sidecar.ErrConversationNotFound:   apperr.CodeConversationNotFound,
		sidecar.ErrTargetIdentityMismatch: apperr.CodeTargetIdentityMismatch,
		sidecar.ErrBrowserSelectorChanged: apperr.CodeAdapterIncompatible,
	}
	for input, want := range tests {
		if got := mapSendSidecarError(input); got != want {
			t.Errorf("mapSendSidecarError(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSendSidecarErrorCodeTreatsMalformedResponseAsUnavailable(t *testing.T) {
	if got := sendSidecarErrorCode(nil); got != sidecar.ErrAdapterUnavailable {
		t.Fatalf("nil response code = %q", got)
	}
}

func TestMessageSendSpecSelectsOperationAndPayload(t *testing.T) {
	tests := []struct {
		name, kind, body, capability, operation, key string
	}{
		{name: "text", kind: "text", body: "  晚安  ", capability: capability.NameMessageTextExisting, operation: sidecar.OpsMessageSendText, key: "text"},
		{name: "sticker", kind: "sticker", body: "  sticker_001  ", capability: capability.NameMessageSticker, operation: sidecar.OpsMessageSendSticker, key: "sticker_id"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := messageSendSpec(tt.kind, tt.body)
			if err != nil {
				t.Fatal(err)
			}
			if got.Capability != tt.capability || got.Operation != tt.operation || got.Message[tt.key] != strings.TrimSpace(tt.body) {
				t.Fatalf("unexpected message spec: %+v", got)
			}
		})
	}
}

func TestMessageSendSpecRejectsUnsupportedOrEmptyPayload(t *testing.T) {
	for _, tt := range []struct{ kind, body string }{{kind: "sticker", body: "  "}, {kind: "voice", body: "voice_001"}} {
		if _, err := messageSendSpec(tt.kind, tt.body); err == nil {
			t.Errorf("messageSendSpec(%q, %q) should fail", tt.kind, tt.body)
		}
	}
}

func TestRequiredTaskFeatureOnlyGatesCreatorFirstMessage(t *testing.T) {
	if got := requiredTaskFeature(false); got != "" {
		t.Fatalf("requiredTaskFeature(false) = %q, want empty", got)
	}
	if got := requiredTaskFeature(true); got != entitlement.FeatureCreatorFirstMessage {
		t.Fatalf("requiredTaskFeature(true) = %q, want %q", got, entitlement.FeatureCreatorFirstMessage)
	}
}

func TestMessageSendSpecSelectsProtocolFirstMessageOperation(t *testing.T) {
	plan, err := messageSendSpecForAdapter("text", "  你好  ", capability.AdapterProtocolIM, true)
	if err != nil {
		t.Fatalf("messageSendSpecForAdapter() error = %v", err)
	}
	if plan.Capability != capability.NameMessageTextFirst || plan.Operation != sidecar.OpsMessageSendFirst || plan.Message["text"] != "你好" {
		t.Fatalf("unexpected protocol first-message plan: %+v", plan)
	}
	if _, err := messageSendSpecForAdapter("text", "hello", capability.AdapterBrowserConsumer, true); err == nil {
		t.Fatal("browser adapter must not execute first-message tasks")
	}
}

func TestSendPreflightRequiresCapabilityAndHealth(t *testing.T) {
	if err := validateSendPreflightDependencies(SessionCheckDeps{}); err == nil {
		t.Fatal("send preflight should require capability snapshots")
	}
	deps := SessionCheckDeps{Capabilities: fallbackCapabilityRepo{}}
	if err := validateSendPreflightDependencies(deps); err == nil || !strings.Contains(err.Error(), "adapter health") {
		t.Fatalf("send preflight should require adapter health, got %v", err)
	}
	deps.Health = fallbackHealth{allowed: true}
	if err := validateSendPreflightDependencies(deps); err != nil {
		t.Fatalf("configured send preflight dependencies rejected: %v", err)
	}
}

type fallbackSendRepo struct {
	send.Repository
	finished struct {
		id        int64
		status    send.JobStatus
		code      string
		retryable bool
	}
	jobs     []*send.SendJob
	lastJob  int64
	statuses []send.IntentStatus
}

func (r *fallbackSendRepo) FinishJob(_ context.Context, id int64, status send.JobStatus, code *string, retryable bool, _ *string, _ time.Time) error {
	r.finished.id, r.finished.status, r.finished.retryable = id, status, retryable
	if code != nil {
		r.finished.code = *code
	}
	return nil
}

func (r *fallbackSendRepo) CreateJob(_ context.Context, job *send.SendJob) error {
	job.ID = int64(len(r.jobs) + 1)
	r.jobs = append(r.jobs, job)
	return nil
}

func (r *fallbackSendRepo) SetIntentLastJob(_ context.Context, _, jobID int64) error {
	r.lastJob = jobID
	return nil
}

func (r *fallbackSendRepo) SetIntentStatus(_ context.Context, _ int64, status send.IntentStatus, _ *string, _ *time.Time, _ time.Time) error {
	r.statuses = append(r.statuses, status)
	return nil
}

type fallbackOutbox struct{ messages []outbox.Message }

func (o *fallbackOutbox) Add(_ context.Context, message outbox.Message) error {
	o.messages = append(o.messages, message)
	return nil
}

type fallbackTx struct{}

func (fallbackTx) WithinTx(ctx context.Context, fn func(context.Context) error) error { return fn(ctx) }

type fallbackCapabilityRepo struct {
	capability.Repository
	snapshot *capability.Capability
	err      error
}

func (r fallbackCapabilityRepo) GetByAccountAndName(context.Context, int64, string) (*capability.Capability, error) {
	return r.snapshot, r.err
}

type fallbackHealth struct {
	allowed bool
	err     error
}

func (h fallbackHealth) Allow(context.Context, string) (bool, error) { return h.allowed, h.err }
func (fallbackHealth) ObserveSuccess(context.Context, string, string, time.Time) error {
	return nil
}
func (fallbackHealth) ObserveFailure(context.Context, string, string, string, time.Time) error {
	return nil
}

func fallbackStringPtr(value string) *string { return &value }

func TestFailureEvidenceFromResponsePreservesNotSentProof(t *testing.T) {
	accepted := false
	evidence := failureEvidenceFromResponse(&sidecar.Response{Error: &sidecar.Error{Detail: map[string]any{
		"outcome": "not_sent", "platform_write_accepted": accepted,
	}}})
	if evidence.Outcome != send.OutcomeNotSent || evidence.PlatformWriteAccepted == nil || *evidence.PlatformWriteAccepted {
		t.Fatalf("evidence = %+v, want explicit not-sent proof", evidence)
	}
	if !send.CanFallback(capability.AdapterProtocolIM, capability.AdapterBrowserConsumer,
		sidecar.ErrAdapterIncompatible, evidence) {
		t.Fatal("explicit not-sent protocol failure should permit browser fallback")
	}
}

func TestBrowserFallbackRequiresCapabilityAndHealth(t *testing.T) {
	adapter := capability.AdapterBrowserConsumer
	tests := []struct {
		name      string
		snapshot  *capability.Capability
		health    capability.HealthObserver
		wantAllow bool
	}{
		{name: "missing snapshot", snapshot: nil, health: fallbackHealth{allowed: true}},
		{name: "unavailable snapshot", snapshot: &capability.Capability{Status: capability.StatusUnavailable, Adapter: &adapter}, health: fallbackHealth{allowed: true}},
		{name: "wrong adapter", snapshot: &capability.Capability{Status: capability.StatusAvailable, Adapter: fallbackStringPtr("protocol.im")}, health: fallbackHealth{allowed: true}},
		{name: "health blocked", snapshot: &capability.Capability{Status: capability.StatusAvailable, Adapter: &adapter}, health: fallbackHealth{allowed: false}},
		{name: "ready", snapshot: &capability.Capability{Status: capability.StatusAvailable, Adapter: &adapter}, health: fallbackHealth{allowed: true}, wantAllow: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			allowed, err := browserFallbackAvailable(context.Background(), SessionCheckDeps{
				Capabilities: fallbackCapabilityRepo{snapshot: tt.snapshot}, Health: tt.health,
			}, 1, capability.NameMessageTextExisting)
			if err != nil || allowed != tt.wantAllow {
				t.Fatalf("browserFallbackAvailable() = %v, err=%v, want %v", allowed, err, tt.wantAllow)
			}
		})
	}
}

func TestFinishSendFallbackCreatesQueuedBrowserAttempt(t *testing.T) {
	repo := &fallbackSendRepo{}
	relay := &fallbackOutbox{}
	claimed := &send.SendJob{
		ID: 9, PublicID: uuid.New(), IntentID: 11, AccountID: 12, FriendID: 13,
		Attempt: 1, Status: send.JobRunning,
	}
	now := func() time.Time { return time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC) }
	err := finishSendFallback(context.Background(), SessionCheckDeps{
		Sends: repo, Outbox: relay, Tx: fallbackTx{},
	}, claimed, apperr.CodeAdapterIncompatible, now, capability.AdapterProtocolIM)
	if err != nil {
		t.Fatalf("finishSendFallback() error = %v", err)
	}
	if repo.finished.id != claimed.ID || repo.finished.status != send.JobFailed || repo.finished.code != apperr.CodeAdapterIncompatible || repo.finished.retryable {
		t.Fatalf("finished protocol job = %+v", repo.finished)
	}
	if len(repo.jobs) != 1 || repo.jobs[0].Attempt != 2 || repo.jobs[0].SelectedAdapter == nil || *repo.jobs[0].SelectedAdapter != capability.AdapterBrowserConsumer {
		t.Fatalf("fallback jobs = %+v", repo.jobs)
	}
	if repo.lastJob != repo.jobs[0].ID || len(repo.statuses) != 1 || repo.statuses[0] != send.IntentQueued {
		t.Fatalf("fallback intent state: last_job=%d statuses=%v", repo.lastJob, repo.statuses)
	}
	if len(relay.messages) != 1 || relay.messages[0].Kind != outbox.KindSendBrowser {
		t.Fatalf("fallback outbox = %+v", relay.messages)
	}
	var payload map[string]string
	if err := json.Unmarshal(relay.messages[0].Payload, &payload); err != nil || payload["job_id"] != repo.jobs[0].PublicID.String() {
		t.Fatalf("fallback outbox payload = %s, err=%v", relay.messages[0].Payload, err)
	}
}
