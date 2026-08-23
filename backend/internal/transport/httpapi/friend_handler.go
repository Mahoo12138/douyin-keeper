package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
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
	friends, err := s.friends.ListForAccount(r.Context(), p.UserID, accountID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items := make([]FriendView, 0, len(friends))
	for _, f := range friends {
		items = append(items, friendView(f))
	}
	writeOK(w, map[string]any{"items": items, "next_cursor": nil})
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