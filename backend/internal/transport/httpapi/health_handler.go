package httpapi

import (
	"context"
	"net/http"
	"time"
)

// handleHealthLive: process is alive, no dependencies checked (docs/16 §11).
func (s *Server) handleHealthLive(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleHealthReady: DB (and Redis when configured) reachable.
func (s *Server) handleHealthReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if s.pg != nil {
		if err := s.pg.Ping(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "db": "error"})
			return
		}
	}
	if s.redis != nil {
		if err := s.redis.Ping(ctx).Err(); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "redis": "error"})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}