package httpapi

import (
	"net/http"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
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
	limit, err := adminListLimit(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	items, err := s.admin.ListAccounts(r.Context(), limit)
	if err != nil {
		writeError(w, r, err)
		return
	}
	views := make([]adminAccountView, 0, len(items))
	for _, item := range items {
		views = append(views, adminAccountViewFrom(item))
	}
	writeOK(w, map[string]any{"items": views, "next_cursor": nil})
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
