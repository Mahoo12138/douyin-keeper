package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

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
	page, err := s.admin.ListAuditLogsPage(r.Context(), filter)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminAuditView, 0, len(page.Items))
	for _, item := range page.Items {
		views = append(views, adminAuditViewFrom(item))
	}
	var nextCursor any
	if page.NextCreatedAt != nil && page.NextAfterID > 0 {
		nextCursor = encodeAdminAuditCursor(*page.NextCreatedAt, page.NextAfterID)
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nextCursor})
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
	filter := admin.AuditFilter{Action: action, ResourceType: resourceType, Actor: actor, Limit: limit}
	if value := r.URL.Query().Get("cursor"); value != "" {
		decoded, err := base64.RawURLEncoding.DecodeString(value)
		if err != nil {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid cursor")
		}
		var payload struct {
			CreatedAt string `json:"created_at"`
			ID        int64  `json:"id"`
		}
		if err := json.Unmarshal(decoded, &payload); err != nil || payload.ID < 1 {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid cursor")
		}
		createdAt, err := time.Parse(time.RFC3339Nano, payload.CreatedAt)
		if err != nil || createdAt.IsZero() {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid cursor")
		}
		filter.AfterCreatedAt = &createdAt
		filter.AfterID = payload.ID
	}
	return filter, nil
}

func encodeAdminAuditCursor(createdAt time.Time, id int64) string {
	payload, _ := json.Marshal(struct {
		CreatedAt string `json:"created_at"`
		ID        int64  `json:"id"`
	}{CreatedAt: createdAt.Format(time.RFC3339Nano), ID: id})
	return base64.RawURLEncoding.EncodeToString(payload)
}

func adminAuditViewFrom(item admin.AuditSummary) adminAuditView {
	return adminAuditView{
		ID: item.ID, ActorDisplayName: item.ActorDisplayName, Action: item.Action,
		ResourceType: item.ResourceType, ResourceID: item.ResourceID, HasDetail: item.HasDetail,
		CreatedAt: item.CreatedAt.Format(timeRFC3339),
	}
}
