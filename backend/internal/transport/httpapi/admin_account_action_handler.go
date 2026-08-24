package httpapi

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
)

func (s *Server) handleAdminPauseAccount(w http.ResponseWriter, r *http.Request) {
	s.handleAdminSetAccountPaused(w, r, true)
}

func (s *Server) handleAdminResumeAccount(w http.ResponseWriter, r *http.Request) {
	s.handleAdminSetAccountPaused(w, r, false)
}

func (s *Server) handleAdminSetAccountPaused(w http.ResponseWriter, r *http.Request, paused bool) {
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	p := auth.MustPrincipal(r.Context())
	item, err := s.admin.SetAccountPaused(r.Context(), p.UserID, accountID, paused)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, adminAccountViewFrom(item))
}
