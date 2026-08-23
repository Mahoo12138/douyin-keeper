package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
)

type redeemReq struct {
	Code string `json:"code"`
}

func (s *Server) handleMyEntitlement(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	eff, err := s.entitlements.GetEffective(r.Context(), p.UserID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, effectiveEntitlementView(eff))
}

func (s *Server) handleRedeem(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	var req redeemReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	if len(req.Code) < 8 {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid card code"))
		return
	}
	grant, eff, err := s.entitlements.Redeem(r.Context(), p.UserID, req.Code)
	if err != nil {
		writeError(w, r, err)
		return
	}
	grantPlan := ""
	if grant.Plan != nil {
		grantPlan = grant.Plan.Code
	}
	writeOK(w, RedeemResultView{
		Grant: GrantView{
			ID: grant.PublicID, PlanCode: grantPlan, SourceType: string(grant.SourceType),
			StartsAt: grant.StartsAt, ExpiresAt: grant.ExpiresAt,
		},
		Entitlement: effectiveEntitlementView(eff),
	})
}

func (s *Server) handleListRedemptions(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	eff, err := s.entitlements.GetEffective(r.Context(), p.UserID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	// M0: surface the effective grant; full grant-history list arrives with
	// the admin console (M5).
	items := []GrantView{}
	if eff.Active && eff.GrantID != nil {
		items = []GrantView{{
			ID: *eff.GrantID, PlanCode: eff.PlanCode, SourceType: string(entitlement.SourceCard),
			StartsAt: deref(eff.StartsAt), ExpiresAt: deref(eff.ExpiresAt),
		}}
	}
	writeOK(w, map[string]any{"items": items})
}

func deref(t *time.Time) time.Time {
	if t == nil {
		return time.Time{}
	}
	return *t
}