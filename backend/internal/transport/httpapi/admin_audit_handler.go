package httpapi

import (
	"net/http"
	"strings"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

type adminAuditView struct {
	ID               int64   `json:"id"`
	ActorDisplayName *string `json:"actor_display_name"`
	Action           string  `json:"action"`
	ResourceType     string  `json:"resource_type"`
	ResourceID       *string `json:"resource_id"`
	HasDetail        bool    `json:"has_detail"`
	CreatedAt        string  `json:"created_at"`
}

func (s *Server) handleAdminListAuditLogs(w http.ResponseWriter, r *http.Request) {
	filter, err := adminAuditFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items, err := s.admin.ListAuditLogs(r.Context(), filter)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminAuditView, 0, len(items))
	for _, item := range items {
		views = append(views, adminAuditViewFrom(item))
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nil})
}

func adminAuditFilter(r *http.Request) (admin.AuditFilter, error) {
	action := strings.TrimSpace(r.URL.Query().Get("action"))
	resourceType := strings.TrimSpace(r.URL.Query().Get("resource_type"))
	actor := strings.TrimSpace(r.URL.Query().Get("actor"))
	if len(action) > 100 || len(resourceType) > 100 || len(actor) > 100 {
		return admin.AuditFilter{}, apperr.Validation(apperr.CodeConflict, "audit filter is too long")
	}
	limit, err := adminListLimit(r)
	if err != nil {
		return admin.AuditFilter{}, err
	}
	return admin.AuditFilter{Action: action, ResourceType: resourceType, Actor: actor, Limit: limit}, nil
}

func adminAuditViewFrom(item admin.AuditSummary) adminAuditView {
	return adminAuditView{
		ID: item.ID, ActorDisplayName: item.ActorDisplayName, Action: item.Action,
		ResourceType: item.ResourceType, ResourceID: item.ResourceID, HasDetail: item.HasDetail,
		CreatedAt: item.CreatedAt.Format(timeRFC3339),
	}
}
