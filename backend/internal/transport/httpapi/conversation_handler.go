package httpapi

import (
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
	items, err := s.conversations.ListForAccount(r.Context(), p.UserID, accountID, conversation.ListFilter{Limit: limit})
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]ConversationView, 0, len(items))
	for _, item := range items {
		views = append(views, conversationView(item))
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nil})
}

func conversationLimit(r *http.Request) (int, error) {
	value := r.URL.Query().Get("limit")
	if value == "" {
		return 100, nil
	}
	limit, err := strconv.Atoi(value)
	if err != nil || limit < 1 || limit > 100 {
		return 0, apperr.Validation(apperr.CodeConflict, "invalid limit")
	}
	return limit, nil
}

func conversationView(item *conversation.Conversation) ConversationView {
	return ConversationView{
		ID: item.ID, FriendID: item.FriendID, FriendDisplayName: item.FriendDisplayName,
		FriendNickname: item.FriendNickname, FriendAvatarURL: item.FriendAvatarURL,
		PlatformIdentityStatus: item.PlatformIdentityStatus, Channel: item.Channel,
		LastMessageAt: item.LastMessageAt, LastSyncedAt: item.LastSyncedAt,
	}
}
