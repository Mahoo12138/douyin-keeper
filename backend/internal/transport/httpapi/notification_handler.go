package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
)

type notificationPreferencesView struct {
	WechatEnabled bool    `json:"wechat_enabled"`
	UpdatedAt     *string `json:"updated_at"`
}

type patchNotificationPreferencesReq struct {
	WechatEnabled *bool `json:"wechat_enabled"`
}

type notificationView struct {
	ID           uuid.UUID `json:"id"`
	Type         string    `json:"type"`
	Priority     string    `json:"priority"`
	Title        string    `json:"title"`
	Body         string    `json:"body"`
	ResourceType *string   `json:"resource_type"`
	ResourceID   *string   `json:"resource_id"`
	ReadAt       *string   `json:"read_at"`
	CreatedAt    string    `json:"created_at"`
	ExpiresAt    *string   `json:"expires_at"`
}

func (s *Server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	principal := auth.MustPrincipal(r.Context())
	filter, err := notificationFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	page, err := s.notifications.ListPage(r.Context(), principal.UserID, filter)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]notificationView, 0, len(page.Items))
	for _, item := range page.Items {
		views = append(views, notificationViewFrom(item))
	}
	var nextCursor any
	if page.NextCreatedAt != nil && page.NextAfterID > 0 {
		nextCursor = encodeNotificationCursor(*page.NextCreatedAt, page.NextAfterID)
	}
	writeOK(w, map[string]any{"items": views, "unread_count": page.UnreadCount, "next_cursor": nextCursor})
}

func (s *Server) handleGetNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	principal := auth.MustPrincipal(r.Context())
	item, err := s.notifications.GetPreferences(r.Context(), principal.UserID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, notificationPreferencesViewFrom(item))
}

func (s *Server) handlePatchNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	principal := auth.MustPrincipal(r.Context())
	var req patchNotificationPreferencesReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.WechatEnabled == nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "wechat_enabled is required"))
		return
	}
	item, err := s.notifications.SetWechatEnabled(r.Context(), principal.UserID, *req.WechatEnabled)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, notificationPreferencesViewFrom(item))
}

func (s *Server) handleMarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	principal := auth.MustPrincipal(r.Context())
	publicID, err := uuid.Parse(pathParam(r, "notificationId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid notification id"))
		return
	}
	if err := s.notifications.MarkRead(r.Context(), principal.UserID, publicID); err != nil {
		writeError(w, r, err)
		return
	}
	writeNoContent(w)
}

func (s *Server) handleMarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	principal := auth.MustPrincipal(r.Context())
	count, err := s.notifications.MarkAllRead(r.Context(), principal.UserID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, map[string]any{"marked_count": count})
}

func notificationFilter(r *http.Request) (notification.ListFilter, error) {
	filter := notification.ListFilter{}
	if value := r.URL.Query().Get("unread_only"); value != "" {
		unreadOnly, err := strconv.ParseBool(value)
		if err != nil {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid unread_only")
		}
		filter.UnreadOnly = unreadOnly
	}
	if value := r.URL.Query().Get("limit"); value != "" {
		limit, err := strconv.Atoi(value)
		if err != nil || limit < 1 || limit > 100 {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid limit")
		}
		filter.Limit = limit
	}
	if value := r.URL.Query().Get("cursor"); value != "" {
		createdAt, id, err := decodeNotificationCursor(value)
		if err != nil {
			return filter, err
		}
		filter.AfterCreatedAt = &createdAt
		filter.AfterID = id
	}
	return filter, nil
}

type notificationCursorPayload struct {
	CreatedAt string `json:"created_at"`
	ID        int64  `json:"id"`
}

func encodeNotificationCursor(createdAt time.Time, id int64) string {
	payload, _ := json.Marshal(notificationCursorPayload{CreatedAt: createdAt.Format(time.RFC3339Nano), ID: id})
	return base64.RawURLEncoding.EncodeToString(payload)
}

func decodeNotificationCursor(value string) (time.Time, int64, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return time.Time{}, 0, apperr.Validation(apperr.CodeConflict, "invalid cursor")
	}
	var payload notificationCursorPayload
	if err := json.Unmarshal(decoded, &payload); err != nil || payload.ID < 1 {
		return time.Time{}, 0, apperr.Validation(apperr.CodeConflict, "invalid cursor")
	}
	createdAt, err := time.Parse(time.RFC3339Nano, payload.CreatedAt)
	if err != nil || createdAt.IsZero() {
		return time.Time{}, 0, apperr.Validation(apperr.CodeConflict, "invalid cursor")
	}
	return createdAt, payload.ID, nil
}

func notificationViewFrom(item *notification.Notification) notificationView {
	return notificationView{
		ID: item.PublicID, Type: string(item.Type), Priority: string(item.Priority),
		Title: item.Title, Body: item.Body, ResourceType: item.ResourceType, ResourceID: item.ResourceID,
		ReadAt: formatOptionalNotificationTime(item.ReadAt), CreatedAt: item.CreatedAt.Format(timeRFC3339),
		ExpiresAt: formatOptionalNotificationTime(item.ExpiresAt),
	}
}

func notificationPreferencesViewFrom(item *notification.Preferences) notificationPreferencesView {
	var updatedAt *string
	if !item.UpdatedAt.IsZero() {
		formatted := item.UpdatedAt.Format(timeRFC3339)
		updatedAt = &formatted
	}
	return notificationPreferencesView{WechatEnabled: item.WechatEnabled, UpdatedAt: updatedAt}
}

func formatOptionalNotificationTime(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.Format(timeRFC3339)
	return &formatted
}
