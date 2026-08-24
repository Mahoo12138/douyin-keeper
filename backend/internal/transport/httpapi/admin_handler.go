package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

type adminUserView struct {
	ID                   string  `json:"id"`
	DisplayName          string  `json:"display_name"`
	Role                 string  `json:"role"`
	Status               string  `json:"status"`
	CreatedAt            string  `json:"created_at"`
	LastLoginAt          *string `json:"last_login_at"`
	AccountCount         int     `json:"account_count"`
	TaskCount            int     `json:"task_count"`
	EntitlementExpiresAt *string `json:"entitlement_expires_at"`
}

func (s *Server) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			writeError(w, r, apperr.Validation(apperr.CodeConflict, "limit must be between 1 and 100"))
			return
		}
		limit = parsed
	}
	items, err := s.admin.ListUsers(r.Context(), limit)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminUserView, 0, len(items))
	for _, item := range items {
		views = append(views, adminUserViewFrom(item))
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nil})
}

func adminUserViewFrom(item admin.UserSummary) adminUserView {
	view := adminUserView{
		ID: item.PublicID.String(), DisplayName: item.DisplayName, Role: item.Role,
		Status: item.Status, CreatedAt: item.CreatedAt.Format(time.RFC3339),
		AccountCount: item.AccountCount, TaskCount: item.TaskCount,
	}
	if item.LastLoginAt != nil {
		value := item.LastLoginAt.Format(time.RFC3339)
		view.LastLoginAt = &value
	}
	if item.EntitlementExpiresAt != nil {
		value := item.EntitlementExpiresAt.Format(time.RFC3339)
		view.EntitlementExpiresAt = &value
	}
	return view
}
