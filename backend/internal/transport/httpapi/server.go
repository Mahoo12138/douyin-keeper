// Package httpapi assembles the chi router, middleware chain and handlers
// (docs/13 §7, docs/11 §16).
package httpapi

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/conversation"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/messagetemplate"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
	"github.com/mahoo12138/douyin-keeper/backend/internal/transport/webassets"
)

// Server injects services into handlers. It is a composition root owned by
// cmd/api; no business logic should live here.
type Server struct {
	auth             *auth.Service
	entitlements     *entitlement.Service
	accounts         *account.Service
	friends          *friend.Service
	conversations    *conversation.Service
	messageTemplates *messagetemplate.Service
	tasks            *task.Service
	sends            *send.Service
	jobs             *job.Service
	admin            *admin.Service
	notifications    *notification.Service
	capabilities     capability.Repository

	signingKey []byte
	refreshTTL time.Duration

	pg      *pgxpool.Pool
	redis   *redis.Client
	metrics *telemetry.Metrics
}

// WithMetrics attaches the process-local Prometheus registry. Keeping this
// optional preserves lightweight handler tests and lets workers use the same
// telemetry package without depending on the HTTP server.
func (s *Server) WithMetrics(metrics *telemetry.Metrics) *Server {
	s.metrics = metrics
	return s
}

func NewServer(authSvc *auth.Service, ent *entitlement.Service, accounts *account.Service,
	friends *friend.Service, conversations *conversation.Service, messageTemplates *messagetemplate.Service, tasks *task.Service, sends *send.Service, jobs *job.Service,
	capabilities capability.Repository, adminSvc *admin.Service, notificationsSvc *notification.Service, signingKey []byte, refreshTTL time.Duration,
	pg *pgxpool.Pool, redis *redis.Client) *Server {
	return &Server{
		auth: authSvc, entitlements: ent, accounts: accounts, friends: friends, conversations: conversations, messageTemplates: messageTemplates,
		tasks: tasks, sends: sends, jobs: jobs, admin: adminSvc, notifications: notificationsSvc, capabilities: capabilities,
		signingKey: signingKey, refreshTTL: refreshTTL, pg: pg, redis: redis,
	}
}

// Router builds the full HTTP handler: /api/v1, /health, /admin, / (SPA).
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()

	r.Use(RequestID, Recover, SecurityHeaders, Metrics(s.metrics), AccessLog)
	r.Get("/health/live", s.handleHealthLive)
	r.Get("/health/ready", s.handleHealthReady)
	if s.metrics != nil {
		r.Get("/metrics", s.metrics.Handler().ServeHTTP)
	}

	// ---- API v1 ----
	r.Route("/api/v1", func(api chi.Router) {
		// Public auth endpoints each get an independent IP window (docs/13 §15).
		api.Group(func(public chi.Router) {
			public.With(RateLimit(30, time.Minute)).Post("/auth/register", s.handleRegister)
			public.With(RateLimit(30, time.Minute)).Post("/auth/login", s.handleLogin)
			public.With(RateLimit(30, time.Minute)).Post("/auth/refresh", s.handleRefresh)
			public.With(RateLimit(30, time.Minute)).Post("/auth/wechat-mini/link", s.handleWechatLink)
			public.With(RateLimit(30, time.Minute)).Post("/auth/wechat-mini/login", s.handleWechatLogin)
		})

		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/users", s.handleAdminListUsers)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/accounts", s.handleAdminListAccounts)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Post("/admin/accounts/{accountId}/pause", s.handleAdminPauseAccount)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Post("/admin/accounts/{accountId}/resume", s.handleAdminResumeAccount)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/entitlement-plans", s.handleAdminListEntitlementPlans)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Post("/admin/entitlement-plans", s.handleAdminCreateEntitlementPlan)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Post("/admin/entitlement-plans/{planId}/disable", s.handleAdminDisableEntitlementPlan)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/card-batches", s.handleAdminListCardBatches)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Post("/admin/card-batches", s.handleAdminCreateCardBatch)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/card-batches/{batchId}", s.handleAdminGetCardBatch)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Post("/admin/card-batches/{batchId}/disable", s.handleAdminDisableCardBatch)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/redemptions", s.handleAdminListRedemptions)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/users/{userId}/entitlements", s.handleAdminListUserEntitlements)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Post("/admin/users/{userId}/entitlement-grants", s.handleAdminCreateUserGrant)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Post("/admin/entitlement-grants/{grantId}/revoke", s.handleAdminRevokeGrant)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/card-batches/{batchId}/codes", s.handleAdminListCardCodes)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Post("/admin/card-batches/{batchId}/codes/{codeId}/revoke", s.handleAdminRevokeCardCode)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/overview", s.handleAdminOverview)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/workers", s.handleAdminRuntime)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/adapters", s.handleAdminListAdapters)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Patch("/admin/adapters/{adapter}", s.handleAdminUpdateAdapter)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/risks", s.handleAdminListRisks)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/audit-logs", s.handleAdminListAuditLogs)

		// Everything else requires authentication.
		api.Group(func(private chi.Router) {
			private.Use(RequireAuth(s.signingKey, s.auth))

			private.Get("/me", s.handleMe)
			private.Post("/auth/logout", s.handleLogout)
			private.Post("/auth/logout-all", s.handleLogoutAll)
			private.With(RateLimitUserAndIP(10, time.Minute)).Post("/auth/link-codes", s.handleCreateLinkCode)

			private.Get("/me/entitlement", s.handleMyEntitlement)
			private.Get("/notifications", s.handleListNotifications)
			private.Get("/notifications/preferences", s.handleGetNotificationPreferences)
			private.Patch("/notifications/preferences", s.handlePatchNotificationPreferences)
			private.Post("/notifications/read-all", s.handleMarkAllNotificationsRead)
			private.Post("/notifications/{notificationId}/read", s.handleMarkNotificationRead)
			private.With(RateLimitUserAndIP(10, time.Minute)).Post("/entitlements/redeem", s.handleRedeem)
			private.Get("/entitlements/redemptions", s.handleListRedemptions)

			private.Get("/accounts", s.handleListAccounts)
			private.Post("/accounts/bindings", s.handleCreateBinding)
			private.Post("/accounts/{accountId}/session-check", s.handleAccountSessionCheck)
			private.Post("/accounts/{accountId}/friends-sync", s.handleAccountFriendsSync)
			private.Post("/accounts/{accountId}/pause", s.handleAccountPause)
			private.Post("/accounts/{accountId}/resume", s.handleAccountResume)
			private.Delete("/accounts/{accountId}", s.handleAccountDelete)
			private.Get("/accounts/{accountId}/capabilities", s.handleAccountCapabilities)

			private.Get("/accounts/{accountId}/friends", s.handleListFriends)
			private.Get("/accounts/{accountId}/conversations", s.handleListConversations)
			private.Patch("/accounts/{accountId}/conversations/{conversationId}", s.handlePatchConversation)
			private.Get("/message-templates", s.handleListMessageTemplates)
			private.Post("/message-templates", s.handleCreateMessageTemplate)
			private.Patch("/message-templates/{templateId}", s.handlePatchMessageTemplate)
			private.Delete("/message-templates/{templateId}", s.handleDeleteMessageTemplate)
			private.Get("/friends/{friendId}", s.handleGetFriend)
			private.Patch("/friends/{friendId}", s.handlePatchFriend)

			private.Get("/tasks", s.handleListTasks)
			private.Post("/tasks", s.handleCreateTask)
			private.Patch("/tasks/{taskId}", s.handlePatchTask)
			private.Delete("/tasks/{taskId}", s.handleDeleteTask)
			private.Post("/tasks/{taskId}/run-now", s.handleTaskRunNow)

			private.Get("/send-intents", s.handleListIntents)
			private.Get("/send-jobs/{jobId}", s.handleGetSendJob)

			private.Get("/jobs/{jobId}", s.handleGetJob)
			private.Get("/jobs/{jobId}/events", s.handleJobEvents)
			private.Post("/jobs/{jobId}/cancel", s.handleCancelJob)
			private.Post("/jobs/{jobId}/sms-verify", s.handleSubmitSMSVerification)
		})
	})

	// ---- Embedded unified SPA. API routes above always win; /admin is a
	// nested TanStack route in the same bundle and is covered by this fallback.
	if web, err := webassets.Web(); err == nil {
		r.Handle("/*", spaHandler(web, "/index.html", ""))
	}
	return r
}

// pathParam reads a chi URL parameter.
func pathParam(r *http.Request, key string) string {
	return chi.URLParam(r, key)
}

// accountsCapabilities resolves ownership then lists capability snapshots.
func (s *Server) accountsCapabilities(ctx context.Context, userID int64, accountID uuid.UUID) ([]CapabilityView, error) {
	acct, err := s.accounts.GetOwned(ctx, userID, accountID)
	if err != nil {
		return nil, err
	}
	items, err := s.capabilities.ListByAccount(ctx, acct.ID)
	if err != nil {
		return nil, err
	}
	out := make([]CapabilityView, 0, len(items))
	for _, c := range items {
		out = append(out, capabilityView(c))
	}
	return out, nil
}
