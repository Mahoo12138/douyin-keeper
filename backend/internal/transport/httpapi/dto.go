package httpapi

import (
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

type UserView struct {
	ID          uuid.UUID `json:"id"`
	DisplayName string    `json:"display_name"`
	Role        string    `json:"role"`
}

func userView(u *auth.User) UserView {
	return UserView{ID: u.PublicID, DisplayName: u.DisplayName, Role: string(u.Role)}
}

type AuthResponse struct {
	AccessToken  string   `json:"access_token"`
	ExpiresIn    int64    `json:"expires_in"`
	RefreshToken *string  `json:"refresh_token,omitempty"`
	User         UserView `json:"user"`
}

func authResponse(s auth.SessionResult) AuthResponse {
	var rt *string
	if s.RefreshToken != "" {
		rt = &s.RefreshToken
	}
	return AuthResponse{
		AccessToken: s.AccessToken, ExpiresIn: s.ExpiresIn, RefreshToken: rt,
		User: userView(s.User),
	}
}

type AccountView struct {
	ID                 uuid.UUID  `json:"id"`
	Nickname           string     `json:"nickname"`
	AvatarURL          *string    `json:"avatar_url"`
	BindingStatus      string     `json:"binding_status"`
	SessionStatus      string     `json:"session_status"`
	RiskStatus         string     `json:"risk_status"`
	PausedAt           *time.Time `json:"paused_at"`
	LastSessionCheckAt *time.Time `json:"last_session_check_at"`
	LastFriendSyncAt   *time.Time `json:"last_friend_sync_at"`
}

func accountView(a *account.Account) AccountView {
	return AccountView{
		ID: a.PublicID, Nickname: a.Nickname, AvatarURL: a.AvatarURL,
		BindingStatus: string(a.BindingStatus), SessionStatus: string(a.SessionStatus),
		RiskStatus: string(a.RiskStatus), PausedAt: a.PausedAt,
		LastSessionCheckAt: a.LastSessionCheckAt, LastFriendSyncAt: a.LastFriendSyncAt,
	}
}

type CapabilityView struct {
	Capability string    `json:"capability"`
	Status     string    `json:"status"`
	Adapter    *string   `json:"adapter"`
	ErrorCode  *string   `json:"error_code"`
	CheckedAt  time.Time `json:"checked_at"`
}

func capabilityView(c capability.Capability) CapabilityView {
	return CapabilityView{Capability: c.Name, Status: c.Status, Adapter: c.Adapter,
		ErrorCode: c.ErrorCode, CheckedAt: c.CheckedAt}
}

type FriendView struct {
	ID                     uuid.UUID  `json:"id"`
	PlatformIdentityStatus string     `json:"platform_identity_status"`
	DisplayName            string     `json:"display_name"`
	Nickname               string     `json:"nickname"`
	ShortID                *string    `json:"short_id"`
	AvatarURL              *string    `json:"avatar_url"`
	StreakDays             int        `json:"streak_days"`
	HasConversation        bool       `json:"has_conversation"`
	SparkEnabled           bool       `json:"spark_enabled"`
	LastSentAt             *time.Time `json:"last_sent_at"`
}

func friendView(f *friend.Friend) FriendView {
	return FriendView{
		ID: f.PublicID, PlatformIdentityStatus: string(f.IdentityStatus),
		DisplayName: f.DisplayName, Nickname: f.Nickname, ShortID: f.ShortID,
		AvatarURL: f.AvatarURL, StreakDays: f.StreakDays, HasConversation: f.HasConversation,
		SparkEnabled: f.SparkEnabled, LastSentAt: f.LastSentAt,
	}
}

type MessageView struct {
	Kind string  `json:"kind"`
	Body *string `json:"body"`
}

type TaskView struct {
	ID                uuid.UUID   `json:"id"`
	AccountID         uuid.UUID   `json:"account_id"`
	FriendID          uuid.UUID   `json:"friend_id"`
	Enabled           bool        `json:"enabled"`
	Timezone          string      `json:"timezone"`
	WindowStart       string      `json:"window_start"`
	WindowEnd         string      `json:"window_end"`
	Message           MessageView `json:"message"`
	AllowFirstMessage bool        `json:"allow_first_message,omitempty"`
}

func taskView(t *task.SparkTask) TaskView {
	return TaskView{
		ID: t.PublicID, AccountID: t.AccountPublicID, FriendID: t.FriendPublicID,
		Enabled: t.Enabled, Timezone: t.Timezone,
		WindowStart: t.WindowStart, WindowEnd: t.WindowEnd,
		Message:           MessageView{Kind: t.MessageKind, Body: t.MessageBody},
		AllowFirstMessage: t.AllowFirstMessage,
	}
}

type JobView struct {
	ID                uuid.UUID  `json:"id"`
	Type              string     `json:"type"`
	Status            string     `json:"status"`
	Cancelable        bool       `json:"cancelable"`
	ErrorCode         *string    `json:"error_code"`
	CreatedAt         time.Time  `json:"created_at"`
	StartedAt         *time.Time `json:"started_at"`
	FinishedAt        *time.Time `json:"finished_at"`
	CancelRequestedAt *time.Time `json:"cancel_requested_at"`
}

func jobView(j *job.Job) JobView {
	return JobView{
		ID: j.PublicID, Type: j.Type, Status: string(j.Status), Cancelable: j.Cancelable,
		ErrorCode: j.ErrorCode, CreatedAt: j.CreatedAt, StartedAt: j.StartedAt,
		FinishedAt: j.FinishedAt, CancelRequestedAt: j.CancelRequestedAt,
	}
}

type JobRef struct {
	JobID uuid.UUID `json:"job_id"`
}

type IntentView struct {
	ID          uuid.UUID          `json:"id"`
	IntentType  string             `json:"intent_type"`
	AccountID   uuid.UUID          `json:"account_id"`
	FriendID    uuid.UUID          `json:"friend_id"`
	TaskID      *uuid.UUID         `json:"task_id"`
	LocalDate   *string            `json:"local_date"`
	Status      string             `json:"status"`
	ErrorCode   *string            `json:"error_code"`
	ScheduledAt time.Time          `json:"scheduled_at"`
	CreatedAt   time.Time          `json:"created_at"`
	Account     HistoryAccountView `json:"account"`
	Friend      HistoryFriendView  `json:"friend"`
	Task        *HistoryTaskView   `json:"task"`
	LatestJob   *HistoryJobView    `json:"latest_job"`
}

type HistoryAccountView struct {
	ID       uuid.UUID `json:"id"`
	Nickname string    `json:"nickname"`
}

type HistoryFriendView struct {
	ID          uuid.UUID `json:"id"`
	DisplayName string    `json:"display_name"`
}

type HistoryTaskView struct {
	ID          uuid.UUID `json:"id"`
	MessageKind string    `json:"message_kind"`
	Body        *string   `json:"body"`
}

type HistoryJobView struct {
	ID        uuid.UUID `json:"id"`
	Adapter   *string   `json:"adapter"`
	Attempt   int       `json:"attempt"`
	Status    string    `json:"status"`
	ErrorCode *string   `json:"error_code"`
}

func intentView(i *send.SendIntent) IntentView {
	var latest *HistoryJobView
	if i.LatestJob != nil {
		latest = &HistoryJobView{ID: i.LatestJob.PublicID, Adapter: i.LatestJob.SelectedAdapter,
			Attempt: i.LatestJob.Attempt, Status: string(i.LatestJob.Status), ErrorCode: i.LatestJob.ErrorCode}
	}
	return IntentView{
		ID: i.PublicID, IntentType: string(i.IntentType), AccountID: i.AccountPublicID,
		FriendID: i.FriendPublicID, TaskID: i.TaskPublicID, LocalDate: i.LocalDate, Status: string(i.Status),
		ErrorCode: i.ErrorCode, ScheduledAt: i.ScheduledAt, CreatedAt: i.CreatedAt,
		Account:   HistoryAccountView{ID: i.AccountPublicID, Nickname: i.AccountNickname},
		Friend:    HistoryFriendView{ID: i.FriendPublicID, DisplayName: i.FriendDisplayName},
		Task:      historyTaskView(i),
		LatestJob: latest,
	}
}

func historyTaskView(i *send.SendIntent) *HistoryTaskView {
	if i.TaskPublicID == nil || i.TaskMessageKind == nil {
		return nil
	}
	return &HistoryTaskView{ID: *i.TaskPublicID, MessageKind: *i.TaskMessageKind, Body: i.TaskMessageBody}
}

type SendJobView struct {
	ID                uuid.UUID  `json:"id"`
	Status            string     `json:"status"`
	Attempt           int        `json:"attempt"`
	SelectedAdapter   *string    `json:"selected_adapter"`
	ErrorCode         *string    `json:"error_code"`
	Retryable         bool       `json:"retryable"`
	PlatformMessageID *string    `json:"platform_message_id"`
	StartedAt         *time.Time `json:"started_at"`
	FinishedAt        *time.Time `json:"finished_at"`
}

func sendJobView(j *send.SendJob) SendJobView {
	return SendJobView{
		ID: j.PublicID, Status: string(j.Status), Attempt: j.Attempt,
		SelectedAdapter: j.SelectedAdapter, ErrorCode: j.ErrorCode, Retryable: j.Retryable,
		PlatformMessageID: j.PlatformMessageID, StartedAt: j.StartedAt, FinishedAt: j.FinishedAt,
	}
}

type EffectiveEntitlementView struct {
	Active         bool                 `json:"active"`
	GrantID        *uuid.UUID           `json:"grant_id,omitempty"`
	PlanCode       string               `json:"plan_code,omitempty"`
	StartsAt       *time.Time           `json:"starts_at,omitempty"`
	ExpiresAt      *time.Time           `json:"expires_at,omitempty"`
	AccountQuota   int                  `json:"account_quota"`
	TaskQuota      int                  `json:"task_quota"`
	DailySendQuota int                  `json:"daily_send_quota"`
	Features       map[string]bool      `json:"features"`
	Usage          EntitlementUsageView `json:"usage"`
}

type EntitlementUsageView struct {
	AccountsUsed      int    `json:"accounts_used"`
	TasksUsed         int    `json:"tasks_used"`
	DailySendReserved int    `json:"daily_send_reserved"`
	QuotaLocalDate    string `json:"quota_local_date"`
}

func effectiveEntitlementView(e entitlement.EffectiveEntitlement) EffectiveEntitlementView {
	return EffectiveEntitlementView{
		Active: e.Active, GrantID: e.GrantID, PlanCode: e.PlanCode,
		StartsAt: e.StartsAt, ExpiresAt: e.ExpiresAt,
		AccountQuota: e.AccountQuota, TaskQuota: e.TaskQuota, DailySendQuota: e.DailySendQuota,
		Features: e.Features,
		Usage: EntitlementUsageView{
			AccountsUsed: e.Usage.AccountsUsed, TasksUsed: e.Usage.TasksUsed,
			DailySendReserved: e.Usage.DailySendReserved, QuotaLocalDate: e.Usage.QuotaLocalDate,
		},
	}
}

type RedeemResultView struct {
	Grant       GrantView                `json:"grant"`
	Entitlement EffectiveEntitlementView `json:"entitlement"`
}

type GrantView struct {
	ID         uuid.UUID  `json:"id"`
	PlanCode   string     `json:"plan_code,omitempty"`
	SourceType string     `json:"source_type"`
	StartsAt   time.Time  `json:"starts_at"`
	ExpiresAt  time.Time  `json:"expires_at"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
}

func grantViewFromSummary(summary entitlement.RedemptionSummary) GrantView {
	return GrantView{
		ID: summary.GrantPublicID, PlanCode: summary.PlanCode, SourceType: string(summary.SourceType),
		StartsAt: summary.StartsAt, ExpiresAt: summary.ExpiresAt, RevokedAt: summary.RevokedAt,
	}
}

type LinkCodeView struct {
	Code      string    `json:"code"`
	ExpiresAt time.Time `json:"expires_at"`
}
