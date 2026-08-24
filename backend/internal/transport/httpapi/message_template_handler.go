package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/messagetemplate"
)

type messageTemplateReq struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
	Body string `json:"body"`
}

type patchMessageTemplateReq struct {
	Name *string `json:"name"`
	Kind *string `json:"kind"`
	Body *string `json:"body"`
}

type MessageTemplateView struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Kind      string    `json:"kind"`
	Body      string    `json:"body"`
	CreatedAt string    `json:"created_at"`
	UpdatedAt string    `json:"updated_at"`
}

func (s *Server) handleListMessageTemplates(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	filter, err := messageTemplateFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	page, err := s.messageTemplates.ListPageForUser(r.Context(), p.UserID, filter)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]MessageTemplateView, 0, len(page.Items))
	for _, item := range page.Items {
		views = append(views, messageTemplateView(item))
	}
	var nextCursor any
	if page.NextUpdatedAt != nil && page.NextAfterID > 0 {
		nextCursor = encodeMessageTemplateCursor(*page.NextUpdatedAt, page.NextAfterID)
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nextCursor})
}

func messageTemplateFilter(r *http.Request) (messagetemplate.ListFilter, error) {
	filter := messagetemplate.ListFilter{Kind: strings.TrimSpace(r.URL.Query().Get("kind"))}
	if value := r.URL.Query().Get("limit"); value != "" {
		limit, err := strconv.Atoi(value)
		if err != nil || limit < 1 || limit > 100 {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid limit")
		}
		filter.Limit = limit
	}
	if value := r.URL.Query().Get("cursor"); value != "" {
		updatedAt, id, err := decodeMessageTemplateCursor(value)
		if err != nil {
			return filter, err
		}
		filter.AfterUpdatedAt = &updatedAt
		filter.AfterID = id
	}
	return filter, nil
}

type messageTemplateCursorPayload struct {
	UpdatedAt string `json:"updated_at"`
	ID        int64  `json:"id"`
}

func encodeMessageTemplateCursor(updatedAt time.Time, id int64) string {
	payload, _ := json.Marshal(messageTemplateCursorPayload{UpdatedAt: updatedAt.Format(time.RFC3339Nano), ID: id})
	return base64.RawURLEncoding.EncodeToString(payload)
}

func decodeMessageTemplateCursor(value string) (time.Time, int64, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return time.Time{}, 0, apperr.Validation(apperr.CodeConflict, "invalid cursor")
	}
	var payload messageTemplateCursorPayload
	if err := json.Unmarshal(decoded, &payload); err != nil || payload.ID < 1 {
		return time.Time{}, 0, apperr.Validation(apperr.CodeConflict, "invalid cursor")
	}
	updatedAt, err := time.Parse(time.RFC3339Nano, payload.UpdatedAt)
	if err != nil || updatedAt.IsZero() {
		return time.Time{}, 0, apperr.Validation(apperr.CodeConflict, "invalid cursor")
	}
	return updatedAt, payload.ID, nil
}

func (s *Server) handleCreateMessageTemplate(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	var req messageTemplateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	item, err := s.messageTemplates.Create(r.Context(), p.UserID, messagetemplate.CreateInput{Name: req.Name, Kind: req.Kind, Body: req.Body})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeCreated(w, messageTemplateView(item))
}

func (s *Server) handlePatchMessageTemplate(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	id, err := uuid.Parse(pathParam(r, "templateId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid template id"))
		return
	}
	var req patchMessageTemplateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	item, err := s.messageTemplates.Update(r.Context(), p.UserID, id, messagetemplate.Patch{Name: req.Name, Kind: req.Kind, Body: req.Body})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, messageTemplateView(item))
}

func (s *Server) handleDeleteMessageTemplate(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	id, err := uuid.Parse(pathParam(r, "templateId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid template id"))
		return
	}
	if err := s.messageTemplates.Delete(r.Context(), p.UserID, id); err != nil {
		writeError(w, r, err)
		return
	}
	writeNoContent(w)
}

func messageTemplateView(item *messagetemplate.Template) MessageTemplateView {
	return MessageTemplateView{ID: item.PublicID, Name: item.Name, Kind: item.Kind, Body: item.Body,
		CreatedAt: item.CreatedAt.Format(timeRFC3339), UpdatedAt: item.UpdatedAt.Format(timeRFC3339)}
}
