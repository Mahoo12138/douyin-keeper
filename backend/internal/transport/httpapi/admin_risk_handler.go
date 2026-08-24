package httpapi

import (
	"net/http"
	"strings"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

type adminRiskView struct {
	ID               string  `json:"id"`
	AccountID        string  `json:"account_id"`
	OwnerDisplayName string  `json:"owner_display_name"`
	Nickname         string  `json:"nickname"`
	Category         string  `json:"category"`
	Code             string  `json:"code"`
	Severity         string  `json:"severity"`
	SourceAdapter    *string `json:"source_adapter"`
	Action           *string `json:"action"`
	CooldownUntil    *string `json:"cooldown_until"`
	CreatedAt        string  `json:"created_at"`
}

var adminRiskCategories = map[string]struct{}{
	"AUTH": {}, "PLATFORM": {}, "PROTOCOL": {}, "BROWSER": {}, "NETWORK": {}, "DATA": {},
}

var adminRiskSeverities = map[string]struct{}{
	"info": {}, "warning": {}, "critical": {},
}

func (s *Server) handleAdminListRisks(w http.ResponseWriter, r *http.Request) {
	filter, err := adminRiskFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items, err := s.admin.ListRisks(r.Context(), filter)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminRiskView, 0, len(items))
	for _, item := range items {
		views = append(views, adminRiskViewFrom(item))
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nil})
}

func adminRiskFilter(r *http.Request) (admin.RiskFilter, error) {
	category := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("category")))
	if category != "" {
		if _, ok := adminRiskCategories[category]; !ok {
			return admin.RiskFilter{}, apperr.Validation(apperr.CodeConflict, "invalid risk category")
		}
	}
	severity := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("severity")))
	if severity != "" {
		if _, ok := adminRiskSeverities[severity]; !ok {
			return admin.RiskFilter{}, apperr.Validation(apperr.CodeConflict, "invalid risk severity")
		}
	}
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if len(code) > 100 {
		return admin.RiskFilter{}, apperr.Validation(apperr.CodeConflict, "risk code filter is too long")
	}
	limit, err := adminListLimit(r)
	if err != nil {
		return admin.RiskFilter{}, err
	}
	return admin.RiskFilter{Category: category, Severity: severity, Code: code, Limit: limit}, nil
}

func adminRiskViewFrom(item admin.RiskSummary) adminRiskView {
	return adminRiskView{
		ID: item.PublicID.String(), AccountID: item.AccountPublicID.String(),
		OwnerDisplayName: item.OwnerDisplayName, Nickname: item.Nickname,
		Category: item.Category, Code: item.Code, Severity: item.Severity,
		SourceAdapter: item.SourceAdapter, Action: item.Action,
		CooldownUntil: formatOptionalAdminTime(item.CooldownUntil), CreatedAt: item.CreatedAt.Format(timeRFC3339),
	}
}
