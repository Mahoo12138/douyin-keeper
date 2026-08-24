package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
)

type adminEntitlementPlanView struct {
	ID             string          `json:"id"`
	Code           string          `json:"code"`
	Name           string          `json:"name"`
	Status         string          `json:"status"`
	AccountQuota   int             `json:"account_quota"`
	TaskQuota      int             `json:"task_quota"`
	DailySendQuota int             `json:"daily_send_quota"`
	Features       map[string]bool `json:"features"`
	CreatedAt      string          `json:"created_at"`
	UpdatedAt      string          `json:"updated_at"`
}

type adminCreatePlanRequest struct {
	Code           string          `json:"code"`
	Name           string          `json:"name"`
	AccountQuota   int             `json:"account_quota"`
	TaskQuota      int             `json:"task_quota"`
	DailySendQuota int             `json:"daily_send_quota"`
	Features       map[string]bool `json:"features"`
}

type adminCardBatchView struct {
	ID                   string  `json:"id"`
	PlanCode             string  `json:"plan_code"`
	PlanName             string  `json:"plan_name"`
	Name                 string  `json:"name"`
	DurationDays         int     `json:"duration_days"`
	Quantity             int     `json:"quantity"`
	Status               string  `json:"status"`
	UnusedCount          int     `json:"unused_count"`
	RedeemedCount        int     `json:"redeemed_count"`
	RevokedCount         int     `json:"revoked_count"`
	RedemptionRate       float64 `json:"redemption_rate"`
	CreatedByDisplayName string  `json:"created_by_display_name"`
	RedeemNotBefore      *string `json:"redeem_not_before"`
	RedeemBefore         *string `json:"redeem_before"`
	Note                 string  `json:"note"`
	CreatedAt            string  `json:"created_at"`
	UpdatedAt            string  `json:"updated_at"`
}

type adminCreateBatchRequest struct {
	PlanID          string  `json:"plan_id"`
	Name            string  `json:"name"`
	DurationDays    int     `json:"duration_days"`
	Quantity        int     `json:"quantity"`
	RedeemNotBefore *string `json:"redeem_not_before"`
	RedeemBefore    *string `json:"redeem_before"`
	Note            string  `json:"note"`
}

type adminCreateBatchResponse struct {
	Batch adminCardBatchView `json:"batch"`
	Codes []string           `json:"codes"`
}

type adminRedemptionView struct {
	ID              string  `json:"id"`
	UserID          string  `json:"user_id"`
	UserDisplayName string  `json:"user_display_name"`
	PlanID          string  `json:"plan_id"`
	PlanCode        string  `json:"plan_code"`
	PlanName        string  `json:"plan_name"`
	SourceType      string  `json:"source_type"`
	Status          string  `json:"status"`
	StartsAt        string  `json:"starts_at"`
	ExpiresAt       string  `json:"expires_at"`
	RedeemedAt      *string `json:"redeemed_at"`
	RevokedAt       *string `json:"revoked_at"`
	RevokeReason    *string `json:"revoke_reason"`
	CodeFingerprint *string `json:"code_fingerprint"`
	CreatedAt       string  `json:"created_at"`
}

type adminEntitlementUserView struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	Status      string `json:"status"`
}

type adminCreateGrantRequest struct {
	PlanID       string `json:"plan_id"`
	DurationDays int    `json:"duration_days"`
}

type adminRevokeEntitlementRequest struct {
	Reason string `json:"reason"`
}

type adminCardCodeView struct {
	ID              int64   `json:"id"`
	CodeFingerprint string  `json:"code_fingerprint"`
	Status          string  `json:"status"`
	RedeemedAt      *string `json:"redeemed_at"`
	RevokedAt       *string `json:"revoked_at"`
	CreatedAt       string  `json:"created_at"`
}

func (s *Server) handleAdminListEntitlementPlans(w http.ResponseWriter, r *http.Request) {
	items, err := s.entitlements.ListPlans(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminEntitlementPlanView, 0, len(items))
	for _, item := range items {
		views = append(views, adminEntitlementPlanViewFrom(*item))
	}
	writeOK(w, map[string]any{"items": views})
}

func (s *Server) handleAdminCreateEntitlementPlan(w http.ResponseWriter, r *http.Request) {
	var req adminCreatePlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid plan body"))
		return
	}
	code := strings.TrimSpace(req.Code)
	name := strings.TrimSpace(req.Name)
	if code == "" || len(code) > 50 || name == "" || len(name) > 100 || req.AccountQuota < 0 || req.TaskQuota < 0 || req.DailySendQuota < 0 {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid entitlement plan"))
		return
	}
	if len(req.Features) > 50 {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "too many plan features"))
		return
	}
	p := auth.MustPrincipal(r.Context())
	plan, err := s.entitlements.CreatePlanByAdmin(r.Context(), p.UserID, &entitlement.Plan{
		Code: code, Name: name, Status: entitlement.StatusActive,
		AccountQuota: req.AccountQuota, TaskQuota: req.TaskQuota, DailySendQuota: req.DailySendQuota,
		Features: req.Features,
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeCreated(w, adminEntitlementPlanViewFrom(*plan))
}

func (s *Server) handleAdminDisableEntitlementPlan(w http.ResponseWriter, r *http.Request) {
	publicID, err := uuid.Parse(pathParam(r, "planId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid entitlement plan id"))
		return
	}
	p := auth.MustPrincipal(r.Context())
	if err := s.entitlements.DisablePlanByAdmin(r.Context(), p.UserID, publicID); err != nil {
		writeError(w, r, err)
		return
	}
	writeNoContent(w)
}

func (s *Server) handleAdminListCardBatches(w http.ResponseWriter, r *http.Request) {
	limit, err := adminListLimit(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items, err := s.entitlements.ListBatchSummaries(r.Context(), limit)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminCardBatchView, 0, len(items))
	for _, item := range items {
		views = append(views, adminCardBatchViewFrom(item))
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nil})
}

func (s *Server) handleAdminGetCardBatch(w http.ResponseWriter, r *http.Request) {
	publicID, err := uuid.Parse(pathParam(r, "batchId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid card batch id"))
		return
	}
	item, err := s.entitlements.GetBatchSummary(r.Context(), publicID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, adminCardBatchViewFrom(item))
}

func (s *Server) handleAdminCreateCardBatch(w http.ResponseWriter, r *http.Request) {
	var req adminCreateBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid card batch body"))
		return
	}
	planID, err := uuid.Parse(strings.TrimSpace(req.PlanID))
	if err != nil || strings.TrimSpace(req.Name) == "" || len(strings.TrimSpace(req.Name)) > 100 || req.DurationDays <= 0 || req.DurationDays > 3660 || req.Quantity <= 0 || req.Quantity > 1000 {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid card batch"))
		return
	}
	plan, err := s.entitlements.GetPlanByPublicID(r.Context(), planID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if plan.Status != entitlement.StatusActive {
		writeError(w, r, apperr.Conflict(apperr.CodeConflict, "entitlement plan is disabled"))
		return
	}
	notBefore, err := parseOptionalAdminTime(req.RedeemNotBefore)
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid redeem_not_before"))
		return
	}
	before, err := parseOptionalAdminTime(req.RedeemBefore)
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid redeem_before"))
		return
	}
	if notBefore != nil && before != nil && !before.After(*notBefore) {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "redeem window is invalid"))
		return
	}
	p := auth.MustPrincipal(r.Context())
	b := &entitlement.CardBatch{
		EntitlementPlanID: plan.ID, Name: strings.TrimSpace(req.Name), DurationDays: req.DurationDays,
		Quantity: req.Quantity, Status: entitlement.StatusActive, CodeVersion: entitlement.CardCodeVersion1,
		RedeemNotBefore: notBefore, RedeemBefore: before, Note: strings.TrimSpace(req.Note),
	}
	codes, err := s.entitlements.CreateBatchWithCodesByAdmin(r.Context(), p.UserID, b)
	if err != nil {
		writeError(w, r, err)
		return
	}
	summary, err := s.entitlements.GetBatchSummary(r.Context(), b.PublicID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeCreated(w, adminCreateBatchResponse{Batch: adminCardBatchViewFrom(summary), Codes: codes})
}

func (s *Server) handleAdminDisableCardBatch(w http.ResponseWriter, r *http.Request) {
	publicID, err := uuid.Parse(pathParam(r, "batchId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid card batch id"))
		return
	}
	p := auth.MustPrincipal(r.Context())
	if err := s.entitlements.DisableBatchByAdmin(r.Context(), p.UserID, publicID); err != nil {
		writeError(w, r, err)
		return
	}
	writeNoContent(w)
}

func (s *Server) handleAdminListRedemptions(w http.ResponseWriter, r *http.Request) {
	limit, err := adminListLimit(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items, err := s.entitlements.ListRedemptionSummaries(r.Context(), limit)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminRedemptionView, 0, len(items))
	for _, item := range items {
		views = append(views, adminRedemptionViewFrom(item))
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nil})
}

func (s *Server) handleAdminListUserEntitlements(w http.ResponseWriter, r *http.Request) {
	userID, err := uuid.Parse(pathParam(r, "userId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid user id"))
		return
	}
	limit, err := adminListLimit(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	user, err := s.auth.GetUserByPublicIDForAdmin(r.Context(), userID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items, err := s.entitlements.ListUserGrantSummaries(r.Context(), user.ID, limit)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminRedemptionView, 0, len(items))
	for _, item := range items {
		views = append(views, adminRedemptionViewFrom(item))
	}
	writeOK(w, map[string]any{
		"user":  adminEntitlementUserView{ID: user.PublicID.String(), DisplayName: user.DisplayName, Status: string(user.Status)},
		"items": views, "next_cursor": nil,
	})
}

func (s *Server) handleAdminCreateUserGrant(w http.ResponseWriter, r *http.Request) {
	userPublicID, err := uuid.Parse(pathParam(r, "userId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid user id"))
		return
	}
	var req adminCreateGrantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid entitlement grant body"))
		return
	}
	planPublicID, err := uuid.Parse(strings.TrimSpace(req.PlanID))
	if err != nil || req.DurationDays <= 0 || req.DurationDays > 3660 {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid entitlement grant"))
		return
	}
	user, err := s.auth.GetUserByPublicIDForAdmin(r.Context(), userPublicID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if !user.IsActive() {
		writeError(w, r, apperr.Conflict(apperr.CodeConflict, "disabled users cannot receive grants"))
		return
	}
	plan, err := s.entitlements.GetPlanByPublicID(r.Context(), planPublicID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if plan.Status != entitlement.StatusActive {
		writeError(w, r, apperr.Conflict(apperr.CodeConflict, "entitlement plan is disabled"))
		return
	}
	actor := auth.MustPrincipal(r.Context())
	grant, err := s.entitlements.GrantByAdmin(r.Context(), actor.UserID, user.ID, plan.ID, time.Duration(req.DurationDays)*24*time.Hour)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeCreated(w, adminRedemptionViewFromGrant(grant, user.PublicID, user.DisplayName, plan))
}

func (s *Server) handleAdminRevokeGrant(w http.ResponseWriter, r *http.Request) {
	grantID, err := uuid.Parse(pathParam(r, "grantId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid entitlement grant id"))
		return
	}
	var req adminRevokeEntitlementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid revoke body"))
		return
	}
	reason := strings.TrimSpace(req.Reason)
	if reason == "" || len(reason) > 500 {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "revoke reason is required"))
		return
	}
	actor := auth.MustPrincipal(r.Context())
	if err := s.entitlements.RevokeGrantByAdmin(r.Context(), actor.UserID, grantID, reason); err != nil {
		writeError(w, r, err)
		return
	}
	writeNoContent(w)
}

func (s *Server) handleAdminListCardCodes(w http.ResponseWriter, r *http.Request) {
	batchID, err := uuid.Parse(pathParam(r, "batchId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid card batch id"))
		return
	}
	limit, err := adminListLimit(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items, err := s.entitlements.ListCardCodeSummaries(r.Context(), batchID, limit)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminCardCodeView, 0, len(items))
	for _, item := range items {
		views = append(views, adminCardCodeView{
			ID: item.ID, CodeFingerprint: item.CodeFingerprint, Status: item.Status,
			RedeemedAt: formatOptionalAdminTime(item.RedeemedAt), RevokedAt: formatOptionalAdminTime(item.RevokedAt),
			CreatedAt: item.CreatedAt.Format(timeRFC3339),
		})
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nil})
}

func (s *Server) handleAdminRevokeCardCode(w http.ResponseWriter, r *http.Request) {
	batchID, err := uuid.Parse(pathParam(r, "batchId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid card batch id"))
		return
	}
	codeID, err := strconv.ParseInt(pathParam(r, "codeId"), 10, 64)
	if err != nil || codeID <= 0 {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid card code id"))
		return
	}
	var req adminRevokeEntitlementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid revoke body"))
		return
	}
	reason := strings.TrimSpace(req.Reason)
	if reason == "" || len(reason) > 500 {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "revoke reason is required"))
		return
	}
	actor := auth.MustPrincipal(r.Context())
	if err := s.entitlements.RevokeUnusedCodeByAdmin(r.Context(), actor.UserID, batchID, codeID, reason); err != nil {
		writeError(w, r, err)
		return
	}
	writeNoContent(w)
}

func adminEntitlementPlanViewFrom(item entitlement.Plan) adminEntitlementPlanView {
	features := make(map[string]bool, len(item.Features))
	for key, value := range item.Features {
		features[key] = value
	}
	return adminEntitlementPlanView{
		ID: item.PublicID.String(), Code: item.Code, Name: item.Name, Status: string(item.Status),
		AccountQuota: item.AccountQuota, TaskQuota: item.TaskQuota, DailySendQuota: item.DailySendQuota,
		Features: features, CreatedAt: item.CreatedAt.Format(timeRFC3339), UpdatedAt: item.UpdatedAt.Format(timeRFC3339),
	}
}

func adminCardBatchViewFrom(item entitlement.CardBatchSummary) adminCardBatchView {
	redemptionRate := float64(0)
	if item.Quantity > 0 {
		redemptionRate = float64(item.RedeemedCount) / float64(item.Quantity)
	}
	return adminCardBatchView{
		ID: item.PublicID.String(), PlanCode: item.PlanCode, PlanName: item.PlanName, Name: item.Name,
		DurationDays: item.DurationDays, Quantity: item.Quantity, Status: string(item.Status),
		UnusedCount: item.UnusedCount, RedeemedCount: item.RedeemedCount, RevokedCount: item.RevokedCount,
		RedemptionRate: redemptionRate, CreatedByDisplayName: item.CreatedByDisplayName,
		RedeemNotBefore: formatOptionalAdminTime(item.RedeemNotBefore), RedeemBefore: formatOptionalAdminTime(item.RedeemBefore),
		Note: item.Note, CreatedAt: item.CreatedAt.Format(timeRFC3339), UpdatedAt: item.UpdatedAt.Format(timeRFC3339),
	}
}

func adminRedemptionViewFrom(item entitlement.RedemptionSummary) adminRedemptionView {
	return adminRedemptionView{
		ID: item.GrantPublicID.String(), UserID: item.UserPublicID.String(), UserDisplayName: item.UserDisplayName,
		PlanID:   item.PlanPublicID.String(),
		PlanCode: item.PlanCode, PlanName: item.PlanName, SourceType: string(item.SourceType),
		Status:   grantStatus(item.StartsAt, item.ExpiresAt, item.RevokedAt, time.Now()),
		StartsAt: item.StartsAt.Format(timeRFC3339), ExpiresAt: item.ExpiresAt.Format(timeRFC3339),
		RedeemedAt: formatOptionalAdminTime(item.RedeemedAt), RevokedAt: formatOptionalAdminTime(item.RevokedAt), RevokeReason: item.RevokeReason,
		CodeFingerprint: item.CodeFingerprint, CreatedAt: item.CreatedAt.Format(timeRFC3339),
	}
}

func adminRedemptionViewFromGrant(grant entitlement.Grant, userID uuid.UUID, displayName string, plan *entitlement.Plan) adminRedemptionView {
	return adminRedemptionView{
		ID: grant.PublicID.String(), UserID: userID.String(), UserDisplayName: displayName, PlanID: plan.PublicID.String(),
		PlanCode: plan.Code, PlanName: plan.Name, SourceType: string(grant.SourceType), Status: grantStatus(grant.StartsAt, grant.ExpiresAt, grant.RevokedAt, time.Now()),
		StartsAt: grant.StartsAt.Format(timeRFC3339), ExpiresAt: grant.ExpiresAt.Format(timeRFC3339), CreatedAt: grant.CreatedAt.Format(timeRFC3339),
	}
}

func grantStatus(startsAt, expiresAt time.Time, revokedAt *time.Time, now time.Time) string {
	if revokedAt != nil {
		return "revoked"
	}
	if !now.Before(startsAt) && now.Before(expiresAt) {
		return "active"
	}
	if now.Before(startsAt) {
		return "scheduled"
	}
	return "expired"
}

func parseOptionalAdminTime(value *string) (*time.Time, error) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*value))
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}
