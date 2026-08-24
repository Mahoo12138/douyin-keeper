package admin

import (
	"context"
	"errors"
	"testing"
)

type repositoryStub struct {
	limit       int
	adapter     AdapterHealthSummary
	actorID     int64
	adapterName string
	enabled     bool
	riskFilter  RiskFilter
}

func (r *repositoryStub) ListUserSummaries(_ context.Context, limit int) ([]UserSummary, error) {
	r.limit = limit
	return nil, nil
}

func (r *repositoryStub) ListAccountSummaries(_ context.Context, limit int) ([]AccountSummary, error) {
	r.limit = limit
	return nil, nil
}

func (r *repositoryStub) GetRuntimeSummary(context.Context) (RuntimeSummary, error) {
	return RuntimeSummary{RunningJobs: 3}, nil
}

func (r *repositoryStub) ListAdapterHealth(context.Context) ([]AdapterHealthSummary, error) {
	return []AdapterHealthSummary{r.adapter}, nil
}

func (r *repositoryStub) SetAdapterEnabled(_ context.Context, actorID int64, adapter string, enabled bool) (AdapterHealthSummary, error) {
	r.actorID, r.adapterName, r.enabled = actorID, adapter, enabled
	return r.adapter, nil
}

func (r *repositoryStub) ListRiskSummaries(_ context.Context, filter RiskFilter) ([]RiskSummary, error) {
	r.riskFilter = filter
	return []RiskSummary{{Code: "SESSION_EXPIRED"}}, nil
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
