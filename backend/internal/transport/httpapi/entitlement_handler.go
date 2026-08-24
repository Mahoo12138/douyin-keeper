package httpapi

import (
	"encoding/json"
	"net/http"

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
			StartsAt: grant.StartsAt, ExpiresAt: grant.ExpiresAt, RevokedAt: grant.RevokedAt,
		},
		Entitlement: effectiveEntitlementView(eff),
	})
}

func (s *Server) handleListRedemptions(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	filter, err := userRedemptionFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	page, err := s.entitlements.ListUserGrantSummariesPage(r.Context(), p.UserID, filter)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items := make([]GrantView, 0, len(page.Items))
	for _, summary := range page.Items {
		items = append(items, grantViewFromSummary(summary))
	}
	var nextCursor any
	if page.NextCreatedAt != nil && page.NextAfterID > 0 {
		nextCursor = encodeRedemptionCursor(*page.NextCreatedAt, page.NextAfterID)
	}
	writeOK(w, map[string]any{"items": items, "next_cursor": nextCursor})
}

func userRedemptionFilter(r *http.Request) (entitlement.RedemptionListFilter, error) {
	limit, err := listLimit(r)
	if err != nil {
		return entitlement.RedemptionListFilter{}, err
	}
	filter := entitlement.RedemptionListFilter{Limit: limit}
	if value := r.URL.Query().Get("cursor"); value != "" {
		createdAt, id, err := decodeRedemptionCursor(value)
		if err != nil {
			return filter, err
		}
		filter.AfterCreatedAt = &createdAt
		filter.AfterID = id
	}
	return filter, nil
}
