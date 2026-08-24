package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

// adminJobView intentionally contains only lifecycle metadata. Generic Job
// event payloads are not an admin list concern and may contain platform or
// user-provided data.
type adminJobView struct {
	ID                string  `json:"id"`
	UserID            *string `json:"user_id"`
	AccountID         *string `json:"account_id"`
	Type              string  `json:"type"`
	Status            string  `json:"status"`
	ErrorCode         *string `json:"error_code"`
	Cancelable        bool    `json:"cancelable"`
	CancelRequestedAt *string `json:"cancel_requested_at"`
	WorkerID          *string `json:"worker_id"`
	HeartbeatAt       *string `json:"heartbeat_at"`
	LeaseExpiresAt    *string `json:"lease_expires_at"`
	CreatedAt         string  `json:"created_at"`
	StartedAt         *string `json:"started_at"`
	FinishedAt        *string `json:"finished_at"`
}

var adminJobStatuses = map[string]struct{}{
	"queued": {}, "running": {}, "waiting_user": {},
	"succeeded": {}, "failed": {}, "cancelled": {},
}

func (s *Server) handleAdminListJobs(w http.ResponseWriter, r *http.Request) {
	filter, err := adminJobFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	page, err := s.admin.ListJobsPage(r.Context(), filter)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminJobView, 0, len(page.Items))
	for _, item := range page.Items {
		views = append(views, adminJobViewFrom(item))
	}
	var nextCursor any
	if page.NextCreatedAt != nil && page.NextAfterID > 0 {
		nextCursor = encodeAdminJobCursor(*page.NextCreatedAt, page.NextAfterID)
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nextCursor})
}

func adminJobFilter(r *http.Request) (admin.JobListFilter, error) {
	status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	if status != "" {
		if _, ok := adminJobStatuses[status]; !ok {
			return admin.JobListFilter{}, apperr.Validation(apperr.CodeConflict, "invalid job status")
		}
	}
	typ := strings.TrimSpace(r.URL.Query().Get("type"))
	if len(typ) > 100 {
		return admin.JobListFilter{}, apperr.Validation(apperr.CodeConflict, "job type filter is too long")
	}
	limit, err := listLimit(r)
	if err != nil {
		return admin.JobListFilter{}, err
	}
	filter := admin.JobListFilter{Status: status, Type: typ, Limit: limit}
	if value := r.URL.Query().Get("cursor"); value != "" {
		decoded, err := base64.RawURLEncoding.DecodeString(value)
		if err != nil {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid cursor")
		}
		var payload struct {
			CreatedAt string `json:"created_at"`
			ID        int64  `json:"id"`
		}
		if err := json.Unmarshal(decoded, &payload); err != nil || payload.ID < 1 {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid cursor")
		}
		createdAt, err := time.Parse(time.RFC3339Nano, payload.CreatedAt)
		if err != nil || createdAt.IsZero() {
			return filter, apperr.Validation(apperr.CodeConflict, "invalid cursor")
		}
		filter.AfterCreatedAt = &createdAt
		filter.AfterID = payload.ID
	}
	return filter, nil
}

func encodeAdminJobCursor(createdAt time.Time, id int64) string {
	payload, _ := json.Marshal(struct {
		CreatedAt string `json:"created_at"`
		ID        int64  `json:"id"`
	}{CreatedAt: createdAt.Format(time.RFC3339Nano), ID: id})
	return base64.RawURLEncoding.EncodeToString(payload)
}

func adminJobViewFrom(item admin.JobSummary) adminJobView {
	view := adminJobView{
		ID: item.PublicID.String(), Type: item.Type, Status: item.Status,
		ErrorCode: item.ErrorCode, Cancelable: item.Cancelable,
		CancelRequestedAt: formatOptionalAdminTime(item.CancelRequestedAt),
		WorkerID:          item.WorkerID, HeartbeatAt: formatOptionalAdminTime(item.HeartbeatAt),
		LeaseExpiresAt: formatOptionalAdminTime(item.LeaseExpiresAt),
		CreatedAt:      item.CreatedAt.Format(timeRFC3339),
		StartedAt:      formatOptionalAdminTime(item.StartedAt), FinishedAt: formatOptionalAdminTime(item.FinishedAt),
	}
	if item.UserPublicID != nil {
		value := item.UserPublicID.String()
		view.UserID = &value
	}
	if item.AccountPublicID != nil {
		value := item.AccountPublicID.String()
		view.AccountID = &value
	}
	return view
}
