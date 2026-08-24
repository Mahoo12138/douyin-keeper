package admin

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

type repositoryStub struct {
	limit           int
	userItems       []UserSummary
	userFilter      UserListFilter
	userDetail      UserSummary
	userStatus      string
	userActorID     int64
	userPublicID    uuid.UUID
	jobItems        []JobSummary
	jobFilter       JobListFilter
	accountItems    []AccountSummary
	accountFilter   AccountListFilter
	riskItems       []RiskSummary
	riskPageFilter  RiskFilter
	auditItems      []AuditSummary
	auditPageFilter AuditFilter
	adapter         AdapterHealthSummary
	actorID         int64
	adapterName     string
	enabled         bool
	accountActorID  int64
	accountID       uuid.UUID
	accountPaused   bool
	riskFilter      RiskFilter
	auditFilter     AuditFilter
	setting         Setting
	settingActorID  int64
	settingKey      string
	settingValue    json.RawMessage
}

func (r *repositoryStub) ListUserSummaries(_ context.Context, limit int) ([]UserSummary, error) {
	r.limit = limit
	return r.userItems, nil
}

func (r *repositoryStub) ListUserSummariesPage(_ context.Context, filter UserListFilter) ([]UserSummary, error) {
	r.userFilter = filter
	return r.userItems, nil
}

func (r *repositoryStub) GetUserSummary(_ context.Context, publicID uuid.UUID) (UserSummary, error) {
	r.userPublicID = publicID
	return r.userDetail, nil
}

func (r *repositoryStub) SetUserStatus(_ context.Context, actorID int64, publicID uuid.UUID, status string) (UserSummary, error) {
	r.userActorID, r.userPublicID, r.userStatus = actorID, publicID, status
	r.userDetail.Status = status
	return r.userDetail, nil
}

func (r *repositoryStub) ListJobSummaries(_ context.Context, filter JobListFilter) ([]JobSummary, error) {
	r.jobFilter = filter
	return r.jobItems, nil
}

func (r *repositoryStub) ListAccountSummaries(_ context.Context, limit int) ([]AccountSummary, error) {
	r.limit = limit
	return r.accountItems, nil
}

func (r *repositoryStub) ListAccountSummariesPage(_ context.Context, filter AccountListFilter) ([]AccountSummary, error) {
	r.accountFilter = filter
	return r.accountItems, nil
}

func (r *repositoryStub) GetRuntimeSummary(context.Context) (RuntimeSummary, error) {
	return RuntimeSummary{RunningJobs: 3}, nil
}

func (r *repositoryStub) GetOverviewSummary(context.Context) (OverviewSummary, error) {
	return OverviewSummary{DAU: 4}, nil
}

func (r *repositoryStub) ListAdapterHealth(context.Context) ([]AdapterHealthSummary, error) {
	return []AdapterHealthSummary{r.adapter}, nil
}

func (r *repositoryStub) SetAdapterEnabled(_ context.Context, actorID int64, adapter string, enabled bool) (AdapterHealthSummary, error) {
	r.actorID, r.adapterName, r.enabled = actorID, adapter, enabled
	return r.adapter, nil
}

func (r *repositoryStub) SetAccountPaused(_ context.Context, actorID int64, accountID uuid.UUID, paused bool) (AccountSummary, error) {
	r.accountActorID, r.accountID, r.accountPaused = actorID, accountID, paused
	return AccountSummary{PublicID: accountID, PausedAt: nil}, nil
}

func (r *repositoryStub) ListRiskSummaries(_ context.Context, filter RiskFilter) ([]RiskSummary, error) {
	r.riskFilter = filter
	if r.riskItems != nil {
		return r.riskItems, nil
	}
	return []RiskSummary{{Code: "SESSION_EXPIRED"}}, nil
}

func (r *repositoryStub) ListRiskSummariesPage(_ context.Context, filter RiskFilter) ([]RiskSummary, error) {
	r.riskPageFilter = filter
	return r.riskItems, nil
}

func (r *repositoryStub) ListAuditSummaries(_ context.Context, filter AuditFilter) ([]AuditSummary, error) {
	r.auditFilter = filter
	if r.auditItems != nil {
		return r.auditItems, nil
	}
	return []AuditSummary{{Action: "adapter.disable"}}, nil
}

func (r *repositoryStub) ListAuditSummariesPage(_ context.Context, filter AuditFilter) ([]AuditSummary, error) {
	r.auditPageFilter = filter
	return r.auditItems, nil
}

func (r *repositoryStub) ListSettings(context.Context) ([]Setting, error) {
	return []Setting{r.setting}, nil
}

func (r *repositoryStub) SetSetting(_ context.Context, actorID int64, key string, value json.RawMessage) (Setting, error) {
	r.settingActorID, r.settingKey, r.settingValue = actorID, key, value
	return Setting{Key: key, Value: value}, nil
}

func TestServiceClampsUserListLimit(t *testing.T) {
	for _, test := range []struct {
		name  string
		input int
		want  int
	}{
		{name: "default", input: 0, want: 50},
		{name: "negative default", input: -1, want: 50},
		{name: "bounded", input: 20, want: 20},
		{name: "maximum", input: 500, want: 100},
	} {
		t.Run(test.name, func(t *testing.T) {
			repo := &repositoryStub{}
			if _, err := NewService(repo).ListUsers(context.Background(), test.input); err != nil {
				t.Fatalf("ListUsers() error = %v", err)
			}
			if repo.limit != test.want {
				t.Fatalf("repository limit = %d, want %d", repo.limit, test.want)
			}
		})
	}
}

func TestServiceListsUserCursorPage(t *testing.T) {
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	repo := &repositoryStub{userItems: []UserSummary{
		{ID: 3, CreatedAt: base.Add(2 * time.Minute)},
		{ID: 2, CreatedAt: base.Add(time.Minute)},
		{ID: 1, CreatedAt: base},
	}}
	page, err := NewService(repo).ListUsersPage(context.Background(), UserListFilter{Limit: 2, AfterID: 9, AfterCreatedAt: func() *time.Time { value := base.Add(3 * time.Minute); return &value }()})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].ID != 3 || page.Items[1].ID != 2 || page.NextAfterID != 2 || page.NextCreatedAt == nil {
		t.Fatalf("page = %+v", page)
	}
	if repo.userFilter.Limit != 2 || repo.userFilter.AfterID != 9 || repo.userFilter.AfterCreatedAt == nil {
		t.Fatalf("filter = %+v", repo.userFilter)
	}
}

func TestServiceListsJobCursorPageAndPreservesFilters(t *testing.T) {
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	repo := &repositoryStub{jobItems: []JobSummary{
		{ID: 3, CreatedAt: base.Add(2 * time.Minute)},
		{ID: 2, CreatedAt: base.Add(time.Minute)},
		{ID: 1, CreatedAt: base},
	}}
	page, err := NewService(repo).ListJobsPage(context.Background(), JobListFilter{
		Status: "failed", Type: "account.bind.qr", Limit: 2,
		AfterID: 9, AfterCreatedAt: func() *time.Time { value := base.Add(3 * time.Minute); return &value }(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].ID != 3 || page.Items[1].ID != 2 || page.NextAfterID != 2 || page.NextCreatedAt == nil {
		t.Fatalf("page = %+v", page)
	}
	if repo.jobFilter.Status != "failed" || repo.jobFilter.Type != "account.bind.qr" || repo.jobFilter.Limit != 3 || repo.jobFilter.AfterID != 9 || repo.jobFilter.AfterCreatedAt == nil {
		t.Fatalf("filter = %+v", repo.jobFilter)
	}
}

func TestServiceListsAccountCursorPage(t *testing.T) {
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	repo := &repositoryStub{accountItems: []AccountSummary{
		{ID: 3, CreatedAt: base.Add(2 * time.Minute)},
		{ID: 2, CreatedAt: base.Add(time.Minute)},
		{ID: 1, CreatedAt: base},
	}}
	page, err := NewService(repo).ListAccountsPage(context.Background(), AccountListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].ID != 3 || page.Items[1].ID != 2 || page.NextAfterID != 2 || page.NextCreatedAt == nil {
		t.Fatalf("page = %+v", page)
	}
	if repo.accountFilter.Limit != 2 || repo.accountFilter.AfterID != 0 || repo.accountFilter.AfterCreatedAt != nil {
		t.Fatalf("filter = %+v", repo.accountFilter)
	}
}

func TestServiceListsRiskCursorPage(t *testing.T) {
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	repo := &repositoryStub{riskItems: []RiskSummary{
		{ID: 3, CreatedAt: base.Add(2 * time.Minute)},
		{ID: 2, CreatedAt: base.Add(time.Minute)},
		{ID: 1, CreatedAt: base},
	}}
	page, err := NewService(repo).ListRisksPage(context.Background(), RiskFilter{Category: "AUTH", Severity: "critical", Code: "expired", Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].ID != 3 || page.Items[1].ID != 2 || page.NextAfterID != 2 || page.NextCreatedAt == nil {
		t.Fatalf("page = %+v", page)
	}
	if repo.riskPageFilter.Limit != 2 || repo.riskPageFilter.Category != "AUTH" || repo.riskPageFilter.Severity != "critical" || repo.riskPageFilter.Code != "expired" {
		t.Fatalf("filter = %+v", repo.riskPageFilter)
	}
}

func TestServiceListsAuditCursorPage(t *testing.T) {
	base := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	repo := &repositoryStub{auditItems: []AuditSummary{
		{ID: 3, CreatedAt: base.Add(2 * time.Minute)},
		{ID: 2, CreatedAt: base.Add(time.Minute)},
		{ID: 1, CreatedAt: base},
	}}
	page, err := NewService(repo).ListAuditLogsPage(context.Background(), AuditFilter{Action: "adapter.disable", ResourceType: "adapter", Actor: "admin", Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].ID != 3 || page.Items[1].ID != 2 || page.NextAfterID != 2 || page.NextCreatedAt == nil {
		t.Fatalf("page = %+v", page)
	}
	if repo.auditPageFilter.Limit != 2 || repo.auditPageFilter.Action != "adapter.disable" || repo.auditPageFilter.ResourceType != "adapter" || repo.auditPageFilter.Actor != "admin" {
		t.Fatalf("filter = %+v", repo.auditPageFilter)
	}
}

func TestServiceClampsAccountListLimit(t *testing.T) {
	for _, test := range []struct {
		name  string
		input int
		want  int
	}{
		{name: "default", input: 0, want: 50},
		{name: "bounded", input: 24, want: 24},
		{name: "maximum", input: 500, want: 100},
	} {
		t.Run(test.name, func(t *testing.T) {
			repo := &repositoryStub{}
			if _, err := NewService(repo).ListAccounts(context.Background(), test.input); err != nil {
				t.Fatalf("ListAccounts() error = %v", err)
			}
			if repo.limit != test.want {
				t.Fatalf("repository limit = %d, want %d", repo.limit, test.want)
			}
		})
	}
}

func TestServiceReturnsRuntimeSummary(t *testing.T) {
	summary, err := NewService(&repositoryStub{}).Runtime(context.Background())
	if err != nil {
		t.Fatalf("Runtime() error = %v", err)
	}
	if summary.RunningJobs != 3 {
		t.Fatalf("running jobs = %d, want 3", summary.RunningJobs)
	}
}

func TestServiceReturnsOverviewSummary(t *testing.T) {
	summary, err := NewService(&repositoryStub{}).Overview(context.Background())
	if err != nil {
		t.Fatalf("Overview() error = %v", err)
	}
	if summary.DAU != 4 {
		t.Fatalf("DAU = %d, want 4", summary.DAU)
	}
}

func TestServiceListsAndTogglesKnownAdapter(t *testing.T) {
	repo := &repositoryStub{adapter: AdapterHealthSummary{Name: "browser.consumer", Status: "disabled"}}
	service := NewService(repo)
	items, err := service.ListAdapters(context.Background())
	if err != nil || len(items) != 1 || items[0].Status != "disabled" {
		t.Fatalf("ListAdapters() = %+v, err = %v", items, err)
	}
	if _, err := service.SetAdapterEnabled(context.Background(), 42, "browser.consumer", true); err != nil {
		t.Fatalf("SetAdapterEnabled() error = %v", err)
	}
	if repo.actorID != 42 || repo.adapterName != "browser.consumer" || !repo.enabled {
		t.Fatalf("toggle request = actor %d adapter %q enabled %v", repo.actorID, repo.adapterName, repo.enabled)
	}
}

func TestServiceRejectsUnknownAdapter(t *testing.T) {
	_, err := NewService(&repositoryStub{}).SetAdapterEnabled(context.Background(), 42, "unknown", true)
	if !errors.Is(err, ErrUnknownAdapter) {
		t.Fatalf("error = %v, want ErrUnknownAdapter", err)
	}
}

func TestServiceTogglesAccountPause(t *testing.T) {
	repo := &repositoryStub{}
	accountID := uuid.MustParse("66666666-6666-6666-6666-666666666666")
	if _, err := NewService(repo).SetAccountPaused(context.Background(), 42, accountID, true); err != nil {
		t.Fatalf("SetAccountPaused() error = %v", err)
	}
	if repo.accountActorID != 42 || repo.accountID != accountID || !repo.accountPaused {
		t.Fatalf("account pause request = actor %d account %s paused %v", repo.accountActorID, repo.accountID, repo.accountPaused)
	}
}

func TestServiceRejectsInvalidAccountPauseRequest(t *testing.T) {
	_, err := NewService(&repositoryStub{}).SetAccountPaused(context.Background(), 42, uuid.Nil, true)
	if !errors.Is(err, ErrInvalidAccount) {
		t.Fatalf("error = %v, want ErrInvalidAccount", err)
	}
}

func TestServiceGetsAndUpdatesUserStatus(t *testing.T) {
	repo := &repositoryStub{userDetail: UserSummary{Status: UserStatusActive}}
	service := NewService(repo)
	publicID := uuid.MustParse("77777777-7777-7777-7777-777777777777")
	if _, err := service.GetUser(context.Background(), publicID); err != nil {
		t.Fatalf("GetUser() error = %v", err)
	}
	if got, err := service.SetUserStatus(context.Background(), 42, publicID, UserStatusDisabled); err != nil || got.Status != UserStatusDisabled {
		t.Fatalf("SetUserStatus() = %+v, err = %v", got, err)
	}
	if repo.userActorID != 42 || repo.userPublicID != publicID || repo.userStatus != UserStatusDisabled {
		t.Fatalf("status request = actor %d user %s status %s", repo.userActorID, repo.userPublicID, repo.userStatus)
	}
}

func TestServiceRejectsInvalidUserStatusRequest(t *testing.T) {
	service := NewService(&repositoryStub{})
	publicID := uuid.MustParse("88888888-8888-8888-8888-888888888888")
	if _, err := service.SetUserStatus(context.Background(), 42, publicID, "paused"); !errors.Is(err, ErrInvalidUserStatus) {
		t.Fatalf("error = %v, want ErrInvalidUserStatus", err)
	}
	if _, err := service.SetUserStatus(context.Background(), 0, publicID, UserStatusActive); !errors.Is(err, ErrInvalidUser) {
		t.Fatalf("error = %v, want ErrInvalidUser", err)
	}
}

func TestServiceNormalizesRiskFilter(t *testing.T) {
	repo := &repositoryStub{}
	items, err := NewService(repo).ListRisks(context.Background(), RiskFilter{Category: "AUTH", Severity: "critical", Code: "expired", Limit: 500})
	if err != nil || len(items) != 1 || items[0].Code != "SESSION_EXPIRED" {
		t.Fatalf("ListRisks() = %+v, err = %v", items, err)
	}
	if repo.riskFilter.Category != "AUTH" || repo.riskFilter.Severity != "critical" || repo.riskFilter.Code != "expired" || repo.riskFilter.Limit != 100 {
		t.Fatalf("risk filter = %+v", repo.riskFilter)
	}
}

func TestServiceNormalizesAuditFilter(t *testing.T) {
	repo := &repositoryStub{}
	items, err := NewService(repo).ListAuditLogs(context.Background(), AuditFilter{Action: "adapter.disable", ResourceType: "adapter", Actor: "admin", Limit: 500})
	if err != nil || len(items) != 1 || items[0].Action != "adapter.disable" {
		t.Fatalf("ListAuditLogs() = %+v, err = %v", items, err)
	}
	if repo.auditFilter.Action != "adapter.disable" || repo.auditFilter.ResourceType != "adapter" || repo.auditFilter.Actor != "admin" || repo.auditFilter.Limit != 100 {
		t.Fatalf("audit filter = %+v", repo.auditFilter)
	}
}

func TestServiceValidatesAndSavesSetting(t *testing.T) {
	repo := &repositoryStub{}
	setting, err := NewService(repo).SetSetting(context.Background(), 42, "feature.notice", json.RawMessage(`{"enabled":true}`))
	if err != nil {
		t.Fatalf("SetSetting() error = %v", err)
	}
	if setting.Key != "feature.notice" || repo.settingActorID != 42 || string(repo.settingValue) != `{"enabled":true}` {
		t.Fatalf("setting = %+v, actor = %d, value = %s", setting, repo.settingActorID, repo.settingValue)
	}
}

func TestServiceRejectsInvalidOrSensitiveSetting(t *testing.T) {
	for _, test := range []struct {
		name  string
		key   string
		value string
	}{
		{name: "bad key", key: "Bad Key", value: `true`},
		{name: "secret key", key: "wechat.secret", value: `"nope"`},
		{name: "invalid json", key: "feature.notice", value: `{`},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := NewService(&repositoryStub{}).SetSetting(context.Background(), 42, test.key, json.RawMessage(test.value)); !errors.Is(err, ErrInvalidSetting) {
				t.Fatalf("error = %v, want ErrInvalidSetting", err)
			}
		})
	}
}
