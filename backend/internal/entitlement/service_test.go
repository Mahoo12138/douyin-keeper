package entitlement

import (
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

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
