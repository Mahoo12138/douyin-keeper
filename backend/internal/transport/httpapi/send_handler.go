package httpapi

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

func (s *Server) handleListIntents(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	filter, err := parseIntentFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	intents, err := s.sends.ListIntents(r.Context(), p.UserID, filter)
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

func parseIntentFilter(r *http.Request) (send.IntentListFilter, error) {
	q := r.URL.Query()
	filter := send.IntentListFilter{Status: q.Get("status")}
	for key, target := range map[string]**uuid.UUID{"account_id": &filter.AccountID, "friend_id": &filter.FriendID} {
		if value := q.Get(key); value != "" {
			id, err := uuid.Parse(value)
			if err != nil {
				return filter, apperr.Validation(apperr.CodeConflict, "invalid "+key)
			}
			*target = &id
		}
	}
	if filter.Status != "" {
		valid := map[string]bool{"pending": true, "queued": true, "running": true, "retry_wait": true, "succeeded": true, "failed": true, "skipped": true, "cancelled": true}
		if !valid[filter.Status] {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid status")
		}
	}
	for key, target := range map[string]**time.Time{"from": &filter.From, "to": &filter.To} {
		if value := q.Get(key); value != "" {
			parsed, err := time.Parse(time.RFC3339, value)
			if err != nil {
				return filter, apperr.Validation(apperr.CodeConflict, "invalid "+key)
			}
			*target = &parsed
		}
	}
	if filter.From != nil && filter.To != nil && !filter.From.Before(*filter.To) {
		return filter, apperr.Validation(apperr.CodeConflict, "from must be before to")
	}
	return filter, nil
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
