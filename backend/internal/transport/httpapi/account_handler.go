package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
)

type createBindingReq struct {
	Method    string `json:"method"`
	Phone     string `json:"phone"`
	AccountID string `json:"account_id"`
}

var smsPhonePattern = regexp.MustCompile(`^\+?[0-9][0-9 ()-]{3,30}$`)

func (s *Server) handleListAccounts(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	filter, err := accountSummaryFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	page, err := s.accounts.ListOwnedSummaryPage(r.Context(), p.UserID, filter)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items := make([]AccountView, 0, len(page.Items))
	for _, a := range page.Items {
		items = append(items, accountSummaryView(a))
	}
	var nextCursor any
	if page.NextAfterID > 0 {
		nextCursor = encodeAccountCursor(page.NextAfterID)
	}
	writeOK(w, map[string]any{"items": items, "next_cursor": nextCursor})
}

func accountSummaryFilter(r *http.Request) (account.SummaryListFilter, error) {
	filter := account.SummaryListFilter{}
	if value := r.URL.Query().Get("limit"); value != "" {
		limit, err := strconv.Atoi(value)
		if err != nil || limit < 1 || limit > 100 {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid limit")
		}
		filter.Limit = limit
	}
	if value := r.URL.Query().Get("cursor"); value != "" {
		decoded, err := base64.RawURLEncoding.DecodeString(value)
		if err != nil {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid cursor")
		}
		id, err := strconv.ParseInt(string(decoded), 10, 64)
		if err != nil || id < 1 {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid cursor")
		}
		filter.AfterID = id
	}
	return filter, nil
}

func encodeAccountCursor(id int64) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.FormatInt(id, 10)))
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
	var (
		jobID uuid.UUID
		err   error
	)
	if strings.TrimSpace(req.AccountID) != "" {
		accountID, parseErr := uuid.Parse(strings.TrimSpace(req.AccountID))
		if parseErr != nil {
			writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
			return
		}
		jobID, err = s.accounts.RebindWithKey(r.Context(), p.UserID, accountID, req.Method, phone, r.Header.Get("Idempotency-Key"))
		if err != nil {
			writeError(w, r, err)
			return
		}
	} else {
		jobID, err = s.accounts.CreateBindingWithKey(r.Context(), p.UserID, req.Method, phone, r.Header.Get("Idempotency-Key"))
		if err != nil {
			writeError(w, r, err)
			return
		}
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
	jobID, err := s.accounts.RequestSessionCheckWithKey(r.Context(), p.UserID, accountID, r.Header.Get("Idempotency-Key"))
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
	jobID, err := s.accounts.RequestFriendsSyncWithKey(r.Context(), p.UserID, accountID, r.Header.Get("Idempotency-Key"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeAccepted(w, JobRef{JobID: jobID})
}

func (s *Server) handleAccountConversationsSync(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	jobID, err := s.accounts.RequestConversationsSyncWithKey(r.Context(), p.UserID, accountID, r.Header.Get("Idempotency-Key"))
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
