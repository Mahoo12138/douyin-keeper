package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

type adminAccountCapabilityView struct {
	Name      string  `json:"name"`
	Status    string  `json:"status"`
	Adapter   *string `json:"adapter"`
	ErrorCode *string `json:"error_code"`
	CheckedAt string  `json:"checked_at"`
}

type adminRecentErrorView struct {
	Category      string  `json:"category"`
	Code          string  `json:"code"`
	Severity      string  `json:"severity"`
	SourceAdapter *string `json:"source_adapter"`
	CreatedAt     string  `json:"created_at"`
}

type adminAccountView struct {
	ID                 string                       `json:"id"`
	OwnerID            string                       `json:"owner_id"`
	OwnerDisplayName   string                       `json:"owner_display_name"`
	PlatformUserID     *string                      `json:"platform_user_id"`
	Nickname           string                       `json:"nickname"`
	BindingStatus      string                       `json:"binding_status"`
	SessionStatus      string                       `json:"session_status"`
	RiskStatus         string                       `json:"risk_status"`
	PausedAt           *string                      `json:"paused_at"`
	CooldownUntil      *string                      `json:"cooldown_until"`
	LastSessionCheckAt *string                      `json:"last_session_check_at"`
	LastFriendSyncAt   *string                      `json:"last_friend_sync_at"`
	Capabilities       []adminAccountCapabilityView `json:"capabilities"`
	TodaySendSucceeded int                          `json:"today_send_succeeded"`
	TodaySendFailed    int                          `json:"today_send_failed"`
	LatestError        *adminRecentErrorView        `json:"latest_error"`
}

func (s *Server) handleAdminListAccounts(w http.ResponseWriter, r *http.Request) {
	filter, err := adminAccountFilter(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	page, err := s.admin.ListAccountsPage(r.Context(), filter)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminAccountView, 0, len(page.Items))
	for _, item := range page.Items {
		views = append(views, adminAccountViewFrom(item))
	}
	var nextCursor any
	if page.NextCreatedAt != nil && page.NextAfterID > 0 {
		nextCursor = encodeAdminAccountCursor(*page.NextCreatedAt, page.NextAfterID)
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nextCursor})
}

func adminAccountFilter(r *http.Request) (admin.AccountListFilter, error) {
	limit, err := listLimit(r)
	if err != nil {
		return admin.AccountListFilter{}, err
	}
	filter := admin.AccountListFilter{Limit: limit}
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

func encodeAdminAccountCursor(createdAt time.Time, id int64) string {
	payload, _ := json.Marshal(struct {
		CreatedAt string `json:"created_at"`
		ID        int64  `json:"id"`
	}{CreatedAt: createdAt.Format(time.RFC3339Nano), ID: id})
	return base64.RawURLEncoding.EncodeToString(payload)
}

func adminAccountViewFrom(item admin.AccountSummary) adminAccountView {
	view := adminAccountView{
		ID: item.PublicID.String(), OwnerID: item.OwnerPublicID.String(), OwnerDisplayName: item.OwnerDisplayName,
		PlatformUserID: item.PlatformUserID, Nickname: item.Nickname,
		BindingStatus: item.BindingStatus, SessionStatus: item.SessionStatus, RiskStatus: item.RiskStatus,
		PausedAt: formatOptionalAdminTime(item.PausedAt), CooldownUntil: formatOptionalAdminTime(item.CooldownUntil),
		LastSessionCheckAt: formatOptionalAdminTime(item.LastSessionCheckAt), LastFriendSyncAt: formatOptionalAdminTime(item.LastFriendSyncAt),
		TodaySendSucceeded: item.TodaySendSucceeded, TodaySendFailed: item.TodaySendFailed,
		Capabilities: make([]adminAccountCapabilityView, 0, len(item.Capabilities)),
	}
	for _, capability := range item.Capabilities {
		view.Capabilities = append(view.Capabilities, adminAccountCapabilityView{
			Name: capability.Name, Status: capability.Status, Adapter: capability.Adapter,
			ErrorCode: capability.ErrorCode, CheckedAt: capability.CheckedAt.Format(time.RFC3339),
		})
	}
	if item.LatestError != nil {
		view.LatestError = &adminRecentErrorView{
			Category: item.LatestError.Category, Code: item.LatestError.Code, Severity: item.LatestError.Severity,
			SourceAdapter: item.LatestError.SourceAdapter, CreatedAt: item.LatestError.CreatedAt.Format(time.RFC3339),
		}
	}
	return view
}

func formatOptionalAdminTime(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.Format(time.RFC3339)
	return &formatted
}
