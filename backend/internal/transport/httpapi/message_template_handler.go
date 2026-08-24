package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

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
	items, err := s.messageTemplates.ListForUser(r.Context(), p.UserID, messagetemplate.ListFilter{Kind: strings.TrimSpace(r.URL.Query().Get("kind"))})
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]MessageTemplateView, 0, len(items))
	for _, item := range items {
		views = append(views, messageTemplateView(item))
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nil})
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
