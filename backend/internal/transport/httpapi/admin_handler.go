package httpapi

import (
	"encoding/base64"
	"encoding/json"
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
	filter, err := adminUserFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	page, err := s.admin.ListUsersPage(r.Context(), filter)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminUserView, 0, len(page.Items))
	for _, item := range page.Items {
		views = append(views, adminUserViewFrom(item))
	}
	var nextCursor any
	if page.NextCreatedAt != nil && page.NextAfterID > 0 {
		nextCursor = encodeAdminUserCursor(*page.NextCreatedAt, page.NextAfterID)
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nextCursor})
}

func adminUserFilter(r *http.Request) (admin.UserListFilter, error) {
	limit, err := listLimit(r)
	if err != nil {
		return admin.UserListFilter{}, err
	}
	filter := admin.UserListFilter{Limit: limit}
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

func encodeAdminUserCursor(createdAt time.Time, id int64) string {
	payload, _ := json.Marshal(struct {
		CreatedAt string `json:"created_at"`
		ID        int64  `json:"id"`
	}{CreatedAt: createdAt.Format(time.RFC3339Nano), ID: id})
	return base64.RawURLEncoding.EncodeToString(payload)
}

func listLimit(r *http.Request) (int, error) {
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			return 0, apperr.Validation(apperr.CodeConflict, "limit must be between 1 and 100")
		}
		return parsed, nil
	}
	return 50, nil
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
