package httpapi

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
)

type createBindingReq struct {
	Method string `json:"method"`
	Phone  string `json:"phone"`
}

var smsPhonePattern = regexp.MustCompile(`^\+?[0-9][0-9 ()-]{3,30}$`)

func (s *Server) handleListAccounts(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accounts, err := s.accounts.ListOwnedSummary(r.Context(), p.UserID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items := make([]AccountView, 0, len(accounts))
	for _, a := range accounts {
		items = append(items, accountSummaryView(a))
	}
	writeOK(w, map[string]any{"items": items, "next_cursor": nil})
}

func (s *Server) handleCreateBinding(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	var req createBindingReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	if req.Method != "qr" && req.Method != "sms" {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "method must be qr or sms"))
		return
	}
	phone := strings.TrimSpace(req.Phone)
	if req.Method == "sms" && !smsPhonePattern.MatchString(phone) {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "phone is required for sms binding"))
		return
	}
	jobID, err := s.accounts.CreateBinding(r.Context(), p.UserID, req.Method, phone)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeAccepted(w, JobRef{JobID: jobID})
}

func (s *Server) handleAccountSessionCheck(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	jobID, err := s.accounts.RequestSessionCheck(r.Context(), p.UserID, accountID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeAccepted(w, JobRef{JobID: jobID})
}

func (s *Server) handleAccountFriendsSync(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	jobID, err := s.accounts.RequestFriendsSync(r.Context(), p.UserID, accountID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeAccepted(w, JobRef{JobID: jobID})
}

func (s *Server) handleAccountCapabilities(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	items, err := s.accountsCapabilities(r.Context(), p.UserID, accountID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, map[string]any{"items": items})
}

func (s *Server) handleAccountPause(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	if err := s.accounts.Pause(r.Context(), p.UserID, accountID); err != nil {
		writeError(w, r, err)
		return
	}
	writeNoContent(w)
}

func (s *Server) handleAccountResume(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	if err := s.accounts.Resume(r.Context(), p.UserID, accountID); err != nil {
		writeError(w, r, err)
		return
	}
	writeNoContent(w)
}

func (s *Server) handleAccountDelete(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	if err := s.accounts.Release(r.Context(), p.UserID, accountID); err != nil {
		writeError(w, r, err)
		return
	}
	writeNoContent(w)
}
