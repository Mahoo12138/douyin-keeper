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
	"github.com/mahoo12138/douyin-keeper/backend/internal/conversation"
)

type ConversationView struct {
	ID                     uuid.UUID  `json:"id"`
	FriendID               uuid.UUID  `json:"friend_id"`
	FriendDisplayName      string     `json:"friend_display_name"`
	FriendNickname         string     `json:"friend_nickname"`
	FriendAvatarURL        *string    `json:"friend_avatar_url"`
	PlatformIdentityStatus string     `json:"platform_identity_status"`
	Channel                string     `json:"channel"`
	LastMessageAt          *time.Time `json:"last_message_at"`
	LastSyncedAt           *time.Time `json:"last_synced_at"`
	Archived               bool       `json:"archived"`
	ArchivedAt             *time.Time `json:"archived_at"`
}

type patchConversationReq struct {
	Archived *bool `json:"archived"`
}

func (s *Server) handleListConversations(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	limit, err := conversationLimit(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	includeArchived, err := conversationIncludeArchived(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	afterID, err := conversationCursor(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	page, err := s.conversations.ListPageForAccount(r.Context(), p.UserID, accountID, conversation.ListFilter{Limit: limit, AfterID: afterID, IncludeArchived: includeArchived})
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]ConversationView, 0, len(page.Items))
	for _, item := range page.Items {
		views = append(views, conversationView(item))
	}
	var nextCursor any
	if page.NextAfterID > 0 {
		nextCursor = encodeConversationCursor(page.NextAfterID)
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nextCursor})
}

func (s *Server) handlePatchConversation(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	conversationID, err := uuid.Parse(pathParam(r, "conversationId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid conversation id"))
		return
	}
	var req patchConversationReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Archived == nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "archived is required"))
		return
	}
	item, err := s.conversations.SetArchived(r.Context(), p.UserID, accountID, conversationID, *req.Archived)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, conversationView(item))
}

func (s *Server) handleRequestPlatformArchive(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	accountID, err := uuid.Parse(pathParam(r, "accountId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid account id"))
		return
	}
	conversationID, err := uuid.Parse(pathParam(r, "conversationId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid conversation id"))
		return
	}
	var req patchConversationReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Archived == nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "archived is required"))
		return
	}
	if s.platformArchives == nil {
		writeError(w, r, apperr.New(apperr.CodeInternal, apperr.KindInternal, "platform archive is not configured"))
		return
	}
	jobID, err := s.platformArchives.Request(r.Context(), p.UserID, accountID, conversationID, *req.Archived)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeAccepted(w, JobRef{JobID: jobID})
}

func conversationLimit(r *http.Request) (int, error) {
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

func conversationCursor(r *http.Request) (int64, error) {
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

func encodeConversationCursor(id int64) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.FormatInt(id, 10)))
}

func conversationIncludeArchived(r *http.Request) (bool, error) {
	value := r.URL.Query().Get("include_archived")
	if value == "" {
		return false, nil
	}
	includeArchived, err := strconv.ParseBool(value)
	if err != nil {
		return false, apperr.Validation(apperr.CodeConflict, "invalid include_archived")
	}
	return includeArchived, nil
}

func conversationView(item *conversation.Conversation) ConversationView {
	return ConversationView{
		ID: item.ID, FriendID: item.FriendID, FriendDisplayName: item.FriendDisplayName,
		FriendNickname: item.FriendNickname, FriendAvatarURL: item.FriendAvatarURL,
		PlatformIdentityStatus: item.PlatformIdentityStatus, Channel: item.Channel,
		LastMessageAt: item.LastMessageAt, LastSyncedAt: item.LastSyncedAt,
		Archived: item.ArchivedAt != nil, ArchivedAt: item.ArchivedAt,
	}
}
