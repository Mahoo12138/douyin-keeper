package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
)

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
	items, unreadCount, err := s.notifications.List(r.Context(), principal.UserID, filter)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]notificationView, 0, len(items))
	for _, item := range items {
		views = append(views, notificationViewFrom(item))
	}
	writeOK(w, map[string]any{"items": views, "unread_count": unreadCount, "next_cursor": nil})
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
		if err != nil || limit < 1 {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid limit")
		}
		filter.Limit = limit
	}
	return filter, nil
}

func notificationViewFrom(item *notification.Notification) notificationView {
	return notificationView{
		ID: item.PublicID, Type: string(item.Type), Priority: string(item.Priority),
		Title: item.Title, Body: item.Body, ResourceType: item.ResourceType, ResourceID: item.ResourceID,
		ReadAt: formatOptionalNotificationTime(item.ReadAt), CreatedAt: item.CreatedAt.Format(timeRFC3339),
		ExpiresAt: formatOptionalNotificationTime(item.ExpiresAt),
	}
}

func formatOptionalNotificationTime(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.Format(timeRFC3339)
	return &formatted
}
