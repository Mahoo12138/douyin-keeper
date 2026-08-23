package httpapi

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
)

func (s *Server) handleListIntents(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	intents, err := s.sends.ListIntents(r.Context(), p.UserID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items := make([]IntentView, 0, len(intents))
	for _, in := range intents {
		items = append(items, intentView(in))
	}
	writeOK(w, map[string]any{"items": items, "next_cursor": nil})
}

func (s *Server) handleGetSendJob(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	id, err := uuid.Parse(pathParam(r, "jobId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid job id"))
		return
	}
	j, err := s.sends.GetJob(r.Context(), p.UserID, id)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, sendJobView(j))
}