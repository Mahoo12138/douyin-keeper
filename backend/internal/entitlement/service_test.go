package entitlement

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

type entitlementCounterStub struct {
	accounts, tasks           int
	accountsCalls, tasksCalls int
	accountsErr, tasksErr     error
}

func (c *entitlementCounterStub) CountAccountsOccupied(context.Context, int64) (int, error) {
	c.accountsCalls++
	return c.accounts, c.accountsErr
}

func (c *entitlementCounterStub) CountTasks(context.Context, int64) (int, error) {
	c.tasksCalls++
	return c.tasks, c.tasksErr
}

type entitlementUsageStub struct {
	daily *DailyUsage
	err   error
}

func (u entitlementUsageStub) ReserveDailySend(context.Context, int64, string, int) (bool, error) {
	return true, nil
}
func (u entitlementUsageStub) GetDailyUsage(context.Context, int64, string) (*DailyUsage, error) {
	return u.daily, u.err
}
func (u entitlementUsageStub) IncrSucceeded(context.Context, int64, string) error { return nil }
func (u entitlementUsageStub) IncrFailed(context.Context, int64, string) error    { return nil }
func (u entitlementUsageStub) ReleaseDailySend(context.Context, int64, string) error {
	return nil
}

type entitlementGrantStub struct {
	grant       *Grant
	redemptions []RedemptionSummary
}

func (r entitlementGrantStub) CreateGrant(context.Context, *Grant) error { return nil }
func (r entitlementGrantStub) GetLastNonRevokedGrant(context.Context, int64) (*Grant, error) {
	return r.grant, nil
}
func (r entitlementGrantStub) GetEffectiveGrant(context.Context, int64, time.Time) (*Grant, bool, error) {
	return r.grant, true, nil
}
func (r entitlementGrantStub) GetGrantBySourceCardID(context.Context, int64) (*Grant, error) {
	return r.grant, nil
}
func (r entitlementGrantStub) RevokeGrant(context.Context, int64, int64, string) error { return nil }
func (r entitlementGrantStub) ListRedemptionSummaries(context.Context, int) ([]RedemptionSummary, error) {
	return r.redemptions, nil
}
func (r entitlementGrantStub) ListRedemptionSummariesPage(context.Context, RedemptionListFilter) ([]RedemptionSummary, error) {
	return r.redemptions, nil
}
func (r entitlementGrantStub) ListUserGrantSummaries(context.Context, int64, int) ([]RedemptionSummary, error) {
	return nil, nil
}
func (r entitlementGrantStub) GetGrantByPublicID(context.Context, uuid.UUID) (*Grant, error) {
	return r.grant, nil
}
func (r entitlementGrantStub) RevokeGrantByPublicID(context.Context, int64, uuid.UUID, string) error {
	return nil
}

func activeGrantForServiceTests() *Grant {
	now := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	return &Grant{
		PublicID: uuid.New(), StartsAt: now.Add(-time.Hour), ExpiresAt: now.Add(time.Hour),
		Plan: &Plan{Code: "standard", AccountQuota: 1, TaskQuota: 1, DailySendQuota: 5},
	}
}

func TestValidatePlanRenewalRejectsDifferentActiveOrScheduledPlan(t *testing.T) {
	now := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name       string
		last       *Grant
		nextPlanID int64
		wantCode   string
	}{
		{name: "no previous grant", last: nil, nextPlanID: 2},
		{name: "same plan extends active grant", last: &Grant{EntitlementPlanID: 1, ExpiresAt: now.Add(time.Hour)}, nextPlanID: 1},
		{name: "different plan conflicts with active grant", last: &Grant{EntitlementPlanID: 1, ExpiresAt: now.Add(time.Hour)}, nextPlanID: 2, wantCode: apperr.CodeEntitlementPlanConflict},
		{name: "different plan conflicts with scheduled grant", last: &Grant{EntitlementPlanID: 1, StartsAt: now.Add(time.Hour), ExpiresAt: now.Add(48 * time.Hour)}, nextPlanID: 2, wantCode: apperr.CodeEntitlementPlanConflict},
		{name: "different plan allowed after expiry", last: &Grant{EntitlementPlanID: 1, ExpiresAt: now}, nextPlanID: 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePlanRenewal(tt.last, tt.nextPlanID, now)
			if tt.wantCode == "" {
				if err != nil {
					t.Fatalf("validatePlanRenewal() error = %v", err)
				}
				return
			}
			app, ok := apperr.As(err)
			if !ok || app.Code != tt.wantCode || app.Kind != apperr.KindConflict {
				t.Fatalf("validatePlanRenewal() error = %v, want %s conflict", err, tt.wantCode)
			}
		})
	}
}

func TestGetEffectiveFailsClosedWhenUsageReadFails(t *testing.T) {
	tests := []struct {
		name    string
		counter *entitlementCounterStub
		usage   entitlementUsageStub
		want    string
	}{
		{name: "accounts", counter: &entitlementCounterStub{accountsErr: errors.New("accounts unavailable")}, want: "count occupied accounts"},
		{name: "tasks", counter: &entitlementCounterStub{tasksErr: errors.New("tasks unavailable")}, want: "count tasks"},
		{name: "daily usage", counter: &entitlementCounterStub{}, usage: entitlementUsageStub{err: errors.New("usage unavailable")}, want: "load daily usage"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &Service{
				grants:   entitlementGrantStub{grant: activeGrantForServiceTests()},
				counters: tt.counter,
				usage:    tt.usage,
				now:      func() time.Time { return time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC) },
			}
			if _, err := svc.GetEffective(context.Background(), 42); err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("GetEffective() error = %v, want %q", err, tt.want)
			}
		})
	}
}

func TestAuthorizeReusesEffectiveUsageForQuotaGate(t *testing.T) {
	counters := &entitlementCounterStub{accounts: 1, tasks: 1}
	svc := &Service{
		grants:   entitlementGrantStub{grant: activeGrantForServiceTests()},
		counters: counters,
		usage: entitlementUsageStub{daily: &DailyUsage{
			ReservedSendCount: 2,
		}},
		now: func() time.Time { return time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC) },
	}
	decision, err := svc.Authorize(context.Background(), AuthorizationRequest{UserID: 42, Action: ActionAccountBind})
	if err != nil || decision.Allowed || decision.ReasonCode != apperr.CodeAccountQuotaExceeded {
		t.Fatalf("Authorize() decision=%+v err=%v", decision, err)
	}
	if counters.accountsCalls != 1 || counters.tasksCalls != 1 {
		t.Fatalf("usage counters called accounts=%d tasks=%d, want one read each", counters.accountsCalls, counters.tasksCalls)
	}
}
