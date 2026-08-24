package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
)

type adminSettingView struct {
	Key       string          `json:"key"`
	Value     json.RawMessage `json:"value"`
	UpdatedAt string          `json:"updated_at"`
}

type adminSettingUpdateRequest struct {
	Value json.RawMessage `json:"value"`
}

func (s *Server) handleAdminListSettings(w http.ResponseWriter, r *http.Request) {
	items, err := s.admin.ListSettings(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminSettingView, 0, len(items))
	for _, item := range items {
		views = append(views, adminSettingViewFrom(item))
	}
	writeOK(w, map[string]any{"items": views})
}

func (s *Server) handleAdminUpdateSetting(w http.ResponseWriter, r *http.Request) {
	var req adminSettingUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "value must be valid JSON"))
		return
	}
	p := auth.MustPrincipal(r.Context())
	item, err := s.admin.SetSetting(r.Context(), p.UserID, pathParam(r, "key"), req.Value)
	if err != nil {
		if errors.Is(err, admin.ErrInvalidSetting) {
			writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid site setting"))
			return
		}
		writeError(w, r, err)
		return
	}
	writeOK(w, adminSettingViewFrom(item))
}

func adminSettingViewFrom(item admin.Setting) adminSettingView {
	return adminSettingView{Key: item.Key, Value: item.Value, UpdatedAt: item.UpdatedAt.Format(timeRFC3339)}
}
