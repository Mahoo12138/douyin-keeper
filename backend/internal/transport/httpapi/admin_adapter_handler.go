package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
)

type adminAdapterView struct {
	Name             string  `json:"name"`
	Status           string  `json:"status"`
	Enabled          bool    `json:"enabled"`
	Executable       bool    `json:"executable"`
	Version          *string `json:"version"`
	ErrorCode        *string `json:"error_code"`
	FailureCount     int     `json:"failure_count"`
	CircuitOpenUntil *string `json:"circuit_open_until"`
	CheckedAt        *string `json:"checked_at"`
}

type adminAdapterStateRequest struct {
	Enabled *bool `json:"enabled"`
}

func (s *Server) handleAdminListAdapters(w http.ResponseWriter, r *http.Request) {
	items, err := s.admin.ListAdapters(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminAdapterView, 0, len(items))
	for _, item := range items {
		views = append(views, adminAdapterViewFrom(item))
	}
	writeOK(w, map[string]any{"items": views})
}

func (s *Server) handleAdminUpdateAdapter(w http.ResponseWriter, r *http.Request) {
	var req adminAdapterStateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Enabled == nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "enabled must be a boolean"))
		return
	}
	p := auth.MustPrincipal(r.Context())
	item, err := s.admin.SetAdapterEnabled(r.Context(), p.UserID, pathParam(r, "adapter"), *req.Enabled)
	if err != nil {
		if errors.Is(err, admin.ErrUnknownAdapter) {
			writeError(w, r, apperr.Validation(apperr.CodeConflict, "unknown adapter"))
			return
		}
		writeError(w, r, err)
		return
	}
	writeOK(w, adminAdapterViewFrom(item))
}

func adminAdapterViewFrom(item admin.AdapterHealthSummary) adminAdapterView {
	return adminAdapterView{
		Name: item.Name, Status: item.Status, Enabled: item.Enabled, Executable: item.Executable,
		Version: item.Version, ErrorCode: item.ErrorCode, FailureCount: item.FailureCount,
		CircuitOpenUntil: formatOptionalAdminTime(item.CircuitOpenUntil),
		CheckedAt:        formatOptionalAdminTime(item.CheckedAt),
	}
}
