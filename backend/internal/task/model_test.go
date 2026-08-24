package task

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
)

func TestSparkTaskValidation(t *testing.T) {
	body := "晚安"
	tests := []struct {
		name          string
		task          SparkTask
		validWindow   bool
		validMessage  bool
		validTimezone bool
	}{
		{
			name:        "valid text task",
			task:        SparkTask{WindowStart: "19:30:00", WindowEnd: "22:30:00", Timezone: "Asia/Shanghai", MessageKind: "text", MessageBody: &body},
			validWindow: true, validMessage: true, validTimezone: true,
		},
		{
			name:        "cross midnight window is rejected",
			task:        SparkTask{WindowStart: "22:30:00", WindowEnd: "01:00:00", Timezone: "Asia/Shanghai", MessageKind: "text", MessageBody: &body},
			validWindow: false, validMessage: true, validTimezone: true,
		},
		{
			name:        "blank text is rejected",
			task:        SparkTask{WindowStart: "19:30:00", WindowEnd: "22:30:00", Timezone: "Asia/Shanghai", MessageKind: "text", MessageBody: stringPtr("  ")},
			validWindow: true, validMessage: false, validTimezone: true,
		},
		{
			name:        "invalid timezone is rejected",
			task:        SparkTask{WindowStart: "19:30:00", WindowEnd: "22:30:00", Timezone: "Mars/Olympus", MessageKind: "sticker", MessageBody: stringPtr("sticker_001")},
			validWindow: true, validMessage: true, validTimezone: false,
		},
		{
			name:        "blank sticker id is rejected",
			task:        SparkTask{WindowStart: "19:30:00", WindowEnd: "22:30:00", Timezone: "Asia/Shanghai", MessageKind: "sticker", MessageBody: stringPtr("  ")},
			validWindow: true, validMessage: false, validTimezone: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.task.ValidWindow(); got != tt.validWindow {
				t.Errorf("ValidWindow() = %t, want %t", got, tt.validWindow)
			}
			if got := tt.task.ValidMessage(); got != tt.validMessage {
				t.Errorf("ValidMessage() = %t, want %t", got, tt.validMessage)
			}
			if got := tt.task.ValidTimezone(); got != tt.validTimezone {
				t.Errorf("ValidTimezone() = %t, want %t", got, tt.validTimezone)
			}
		})
	}
}

func TestApplyPatchPreservesUnspecifiedTaskFields(t *testing.T) {
	body := "旧消息"
	task := &SparkTask{
		Enabled: true, Timezone: "Asia/Shanghai", WindowStart: "19:30:00", WindowEnd: "22:30:00",
		MessageKind: "text", MessageBody: &body, AllowFirstMessage: false,
	}
	newBody := "新消息"
	applyPatch(task, TaskPatch{Enabled: boolPtr(false), MessageBody: &newBody, AllowFirstMessage: boolPtr(true)})

	if task.Enabled || task.MessageBody == nil || *task.MessageBody != newBody || !task.AllowFirstMessage {
		t.Fatalf("patch did not update requested fields: %+v", task)
	}
	if task.Timezone != "Asia/Shanghai" || task.WindowStart != "19:30:00" || task.WindowEnd != "22:30:00" || task.MessageKind != "text" {
		t.Fatalf("patch changed unspecified fields: %+v", task)
	}
}

func TestQuotaGateErrorMapping(t *testing.T) {
	for _, code := range []string{apperr.CodeEntitlementRequired, apperr.CodeEntitlementExpired, apperr.CodeFeatureNotEntitled} {
		err := quotaGateErr(code)
		app, ok := apperr.As(err)
		if !ok || app.Code != code || app.Kind != apperr.KindForbidden {
			t.Errorf("quotaGateErr(%q) = %v, want forbidden code", code, err)
		}
	}
	if app, ok := apperr.As(quotaGateErr("unknown")); !ok || app.Code != apperr.CodeTaskQuotaExceeded || app.Kind != apperr.KindQuota {
		t.Errorf("unknown quota reason mapped incorrectly: %v", app)
	}
}

func TestCreateFirstMessageRequiresEntitlementFeature(t *testing.T) {
	accountID := uuid.New()
	friendID := uuid.New()
	input := CreateInput{
		AccountPublicID: accountID, FriendPublicID: friendID,
		Timezone: "Asia/Shanghai", WindowStart: "19:30:00", WindowEnd: "22:30:00",
		MessageKind: "text", MessageBody: stringPtr("晚安"), Enabled: true, AllowFirstMessage: true,
	}

	deniedGate := &taskGateStub{decision: entitlement.AuthorizationDecision{ReasonCode: apperr.CodeFeatureNotEntitled}}
	deniedRepo := &taskRepoStub{}
	service := newTaskService(deniedRepo, deniedGate, accountID, friendID)
	_, err := service.Create(context.Background(), 7, input)
	if app, ok := apperr.As(err); !ok || app.Code != apperr.CodeFeatureNotEntitled {
		t.Fatalf("Create() error = %v, want FEATURE_NOT_ENTITLED", err)
	}
	if len(deniedGate.requests) != 1 || deniedGate.requests[0].RequiredFeature != entitlement.FeatureCreatorFirstMessage {
		t.Fatalf("unexpected authorization request: %+v", deniedGate.requests)
	}
	if deniedRepo.created != nil {
		t.Fatal("feature-denied task must not be created")
	}

	allowedGate := &taskGateStub{decision: entitlement.AuthorizationDecision{
		Allowed: true, Entitlement: &entitlement.EffectiveEntitlement{TaskQuota: 10},
	}}
	allowedRepo := &taskRepoStub{}
	service = newTaskService(allowedRepo, allowedGate, accountID, friendID)
	created, err := service.Create(context.Background(), 7, input)
	if err != nil {
		t.Fatalf("Create() returned error for entitled feature: %v", err)
	}
	if created == nil || !created.AllowFirstMessage || allowedRepo.created == nil {
		t.Fatalf("created task did not preserve allow_first_message: %+v", created)
	}
}

func TestUpdateFirstMessageRequiresEntitlementFeature(t *testing.T) {
	taskID := uuid.New()
	gate := &taskGateStub{decision: entitlement.AuthorizationDecision{ReasonCode: apperr.CodeFeatureNotEntitled}}
	repo := &taskRepoStub{task: &SparkTask{
		ID: 11, PublicID: taskID, UserID: 7, Timezone: "Asia/Shanghai",
		WindowStart: "19:30:00", WindowEnd: "22:30:00", MessageKind: "text", MessageBody: stringPtr("晚安"),
	}}
	service := newTaskService(repo, gate, uuid.New(), uuid.New())
	_, err := service.Update(context.Background(), 7, taskID, TaskPatch{AllowFirstMessage: boolPtr(true)})
	if app, ok := apperr.As(err); !ok || app.Code != apperr.CodeFeatureNotEntitled {
		t.Fatalf("Update() error = %v, want FEATURE_NOT_ENTITLED", err)
	}
	if repo.updated != nil || len(gate.requests) != 1 || gate.requests[0].RequiredFeature != entitlement.FeatureCreatorFirstMessage {
		t.Fatalf("feature-denied update mutated state: updated=%+v requests=%+v", repo.updated, gate.requests)
	}
}

type taskGateStub struct {
	requests []entitlement.AuthorizationRequest
	decision entitlement.AuthorizationDecision
}

func (g *taskGateStub) Authorize(_ context.Context, req entitlement.AuthorizationRequest) (entitlement.AuthorizationDecision, error) {
	g.requests = append(g.requests, req)
	return g.decision, nil
}

type taskRepoStub struct {
	task    *SparkTask
	created *SparkTask
	updated *SparkTask
}

func (r *taskRepoStub) ListByUser(context.Context, int64) ([]*SparkTask, error) { return nil, nil }
func (r *taskRepoStub) GetByID(context.Context, int64) (*SparkTask, error)      { return r.task, nil }
func (r *taskRepoStub) GetOwned(context.Context, int64, uuid.UUID) (*SparkTask, error) {
	return r.task, nil
}
func (r *taskRepoStub) Create(_ context.Context, task *SparkTask) error {
	r.created = task
	return nil
}
func (r *taskRepoStub) Update(_ context.Context, task *SparkTask) error {
	r.updated = task
	return nil
}
func (r *taskRepoStub) SoftDelete(context.Context, int64) error        { return nil }
func (r *taskRepoStub) CountTasks(context.Context, int64) (int, error) { return 0, nil }

type taskAccountLookupStub struct{ value *account.Account }

func (s taskAccountLookupStub) GetOwned(context.Context, int64, uuid.UUID) (*account.Account, error) {
	return s.value, nil
}

type taskFriendLookupStub struct{ value *friend.Friend }

func (s taskFriendLookupStub) GetOwned(context.Context, int64, uuid.UUID) (*friend.Friend, error) {
	return s.value, nil
}

type taskLockerStub struct{}

func (taskLockerStub) LockUserForUpdate(context.Context, int64) error { return nil }

type taskTxStub struct{}

func (taskTxStub) WithinTx(ctx context.Context, fn func(context.Context) error) error { return fn(ctx) }

func newTaskService(repo Repository, gate Gate, accountID, friendID uuid.UUID) *Service {
	return NewService(repo,
		taskAccountLookupStub{value: &account.Account{ID: 42, PublicID: accountID, UserID: 7, BindingStatus: account.BindingBound}},
		taskFriendLookupStub{value: &friend.Friend{ID: 43, PublicID: friendID, AccountID: 42, IdentityStatus: friend.IdentityResolved}},
		gate, taskLockerStub{}, taskTxStub{})
}

func stringPtr(value string) *string { return &value }

func boolPtr(value bool) *bool { return &value }
