package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

var smsVerificationCodePattern = regexp.MustCompile(`^[0-9]{4,8}$`)

func (s *Server) handleGetJob(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	id, err := uuid.Parse(pathParam(r, "jobId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid job id"))
		return
	}
	j, err := s.jobs.Get(r.Context(), &p.UserID, id)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, jobView(j))
}

// handleJobEvents streams the append-only job event log over SSE. The DB is
// the source of truth: first a replay, then a small poll for new seqs (docs/07).
func (s *Server) handleJobEvents(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	id, err := uuid.Parse(pathParam(r, "jobId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid job id"))
		return
	}
	j, err := s.jobs.Get(r.Context(), &p.UserID, id)
	if err != nil {
		writeError(w, r, err)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, r, apperr.New(apperr.CodeInternal, apperr.KindInternal, "streaming unsupported"))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	type event struct {
		Seq       int64           `json:"seq"`
		EventType string          `json:"event_type"`
		Payload   json.RawMessage `json:"payload"`
	}
	send := func(e event) {
		payload, _ := json.Marshal(e.Payload)
		writeSSEEvent(w, e.EventType, e.Seq, payload)
		flusher.Flush()
	}

	// Replay first.
	events, err := s.jobs.Events(r.Context(), j.ID)
	last := lastEventID(r)
	if err == nil {
		for _, e := range events {
			if e.Seq <= last {
				continue
			}
			send(event{Seq: e.Seq, EventType: e.EventType, Payload: e.Payload})
			last = e.Seq
		}
	}

	// Poll loop ~2s; emit only rows newer than last.
	tick := time.NewTicker(2 * time.Second)
	defer tick.Stop()
	idle := time.NewTimer(5 * time.Minute)
	defer idle.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-idle.C:
			return
		case <-tick.C:
			events, err := s.jobs.Events(r.Context(), j.ID)
			if err != nil {
				continue
			}
			for _, e := range events {
				if e.Seq > last {
					send(event{Seq: e.Seq, EventType: e.EventType, Payload: e.Payload})
					last = e.Seq
				}
			}
		}
	}
}

func lastEventID(r *http.Request) int64 {
	value := r.Header.Get("Last-Event-ID")
	if value == "" {
		return 0
	}
	seq, err := strconv.ParseInt(value, 10, 64)
	if err != nil || seq < 0 {
		return 0
	}
	return seq
}

func writeSSEEvent(w io.Writer, eventType string, seq int64, payload []byte) {
	_, _ = fmt.Fprintf(w, "event: %s\nid: %d\ndata: %s\n\n", eventType, seq, payload)
}

func (s *Server) handleCancelJob(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	id, err := uuid.Parse(pathParam(r, "jobId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid job id"))
		return
	}
	if err := s.jobs.RequestCancel(r.Context(), &p.UserID, id); err != nil {
		writeError(w, r, err)
		return
	}
	writeAccepted(w, map[string]any{"status": "cancel_requested"})
}

func (s *Server) handleSubmitSMSVerification(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	id, err := uuid.Parse(pathParam(r, "jobId"))
	if err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid job id"))
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	code := strings.TrimSpace(req.Code)
	if !smsVerificationCodePattern.MatchString(code) {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "code must be 4 to 8 digits"))
		return
	}
	j, err := s.jobs.Get(r.Context(), &p.UserID, id)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if (j.Type != "account.bind.sms" && j.Type != "account.relogin.sms") || j.Status != job.StatusWaiting {
		writeError(w, r, apperr.Conflict(apperr.CodeConflict, "sms binding is not waiting for verification"))
		return
	}
	if s.redis == nil {
		writeError(w, r, apperr.New(apperr.CodeInternal, apperr.KindInternal, "redis is unavailable"))
		return
	}
	if err := s.redis.Set(r.Context(), job.SMSVerificationKey(id), code, job.SMSVerificationTTL).Err(); err != nil {
		writeError(w, r, apperr.New(apperr.CodeInternal, apperr.KindInternal, "verification code delivery failed"))
		return
	}
	writeAccepted(w, map[string]any{"status": "verification_submitted"})
}
