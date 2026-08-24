package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
)

type patchFriendReq struct {
	SparkEnabled *bool `json:"spark_enabled"`
}

func (s *Server) handleListFriends(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	limit, err := friendLimit(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	afterID, err := friendCursor(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	page, err := s.friends.ListPageForAccount(r.Context(), p.UserID, accountID, friend.ListFilter{Limit: limit, AfterID: afterID})
	if err != nil {
		writeError(w, r, err)
		return
	}
	items := make([]FriendView, 0, len(page.Items))
	for _, f := range page.Items {
		items = append(items, friendView(f))
	}
	var nextCursor any
	if page.NextAfterID > 0 {
		nextCursor = encodeFriendCursor(page.NextAfterID)
	}
	writeOK(w, map[string]any{"items": items, "next_cursor": nextCursor})
}

func friendLimit(r *http.Request) (int, error) {
	value := r.URL.Query().Get("limit")
	if value == "" {
		return 50, nil
	}
	limit, err := strconv.Atoi(value)
	if err != nil || limit < 1 || limit > 100 {
		return 0, apperr.Validation(apperr.CodeConflict, "invalid limit")
	}
	return limit, nil
}

func friendCursor(r *http.Request) (int64, error) {
	value := r.URL.Query().Get("cursor")
	if value == "" {
		return 0, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return 0, apperr.Validation(apperr.CodeConflict, "invalid cursor")
	}
	id, err := strconv.ParseInt(string(decoded), 10, 64)
	if err != nil || id < 1 {
		return 0, apperr.Validation(apperr.CodeConflict, "invalid cursor")
	}
	return id, nil
}

func encodeFriendCursor(id int64) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.FormatInt(id, 10)))
}

func (s *Server) handleGetFriend(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	friendID, err := uuid.Parse(pathParam(r, "friendId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid friend id"))
		return
	}
	f, err := s.friends.GetOwned(r.Context(), p.UserID, friendID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, friendView(f))
}

func (s *Server) handlePatchFriend(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	friendID, err := uuid.Parse(pathParam(r, "friendId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid friend id"))
		return
	}
	var req patchFriendReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	if req.SparkEnabled == nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "spark_enabled is required"))
		return
	}
	f, err := s.friends.SetSparkEnabled(r.Context(), p.UserID, friendID, *req.SparkEnabled)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, friendView(f))
}
