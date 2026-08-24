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
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
	"github.com/mahoo12138/douyin-keeper/backend/internal/transport/webassets"
)

// Server injects services into handlers. It is a composition root owned by
// cmd/api; no business logic should live here.
type Server struct {
	auth         *auth.Service
	entitlements *entitlement.Service
	accounts     *account.Service
	friends      *friend.Service
	tasks        *task.Service
	sends        *send.Service
	jobs         *job.Service
	admin        *admin.Service
	capabilities capability.Repository

	signingKey []byte
	refreshTTL time.Duration

	pg    *pgxpool.Pool
	redis *redis.Client
}

func NewServer(authSvc *auth.Service, ent *entitlement.Service, accounts *account.Service,
	friends *friend.Service, tasks *task.Service, sends *send.Service, jobs *job.Service,
	capabilities capability.Repository, adminSvc *admin.Service, signingKey []byte, refreshTTL time.Duration,
	pg *pgxpool.Pool, redis *redis.Client) *Server {
	return &Server{
		auth: authSvc, entitlements: ent, accounts: accounts, friends: friends,
		tasks: tasks, sends: sends, jobs: jobs, admin: adminSvc, capabilities: capabilities,
		signingKey: signingKey, refreshTTL: refreshTTL, pg: pg, redis: redis,
	}
}

// Router builds the full HTTP handler: /api/v1, /health, /admin, / (SPA).
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()

	r.Use(RequestID, Recover, SecurityHeaders, AccessLog)
	r.Get("/health/live", s.handleHealthLive)
	r.Get("/health/ready", s.handleHealthReady)

	// ---- API v1 ----
	r.Route("/api/v1", func(api chi.Router) {
		// Public auth endpoints (rate-limited per docs/13 §15).
		api.Group(func(public chi.Router) {
			public.Use(RateLimit(30, time.Minute))
			public.Post("/auth/register", s.handleRegister)
			public.Post("/auth/login", s.handleLogin)
			public.Post("/auth/refresh", s.handleRefresh)
			public.Post("/auth/wechat-mini/link", s.handleWechatLink)
			public.Post("/auth/wechat-mini/login", s.handleWechatLogin)
		})

		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/users", s.handleAdminListUsers)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/accounts", s.handleAdminListAccounts)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/workers", s.handleAdminRuntime)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/adapters", s.handleAdminListAdapters)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Patch("/admin/adapters/{adapter}", s.handleAdminUpdateAdapter)
		api.With(RequiresRole(auth.RoleAdmin, s.signingKey, s.auth)).Get("/admin/risks", s.handleAdminListRisks)

		// Everything else requires authentication.
		api.Group(func(private chi.Router) {
			private.Use(RequireAuth(s.signingKey, s.auth))

			private.Get("/me", s.handleMe)
			private.Post("/auth/logout", s.handleLogout)
			private.Post("/auth/logout-all", s.handleLogoutAll)
			private.Post("/auth/link-codes", s.handleCreateLinkCode)

			private.Get("/me/entitlement", s.handleMyEntitlement)
			private.Post("/entitlements/redeem", s.handleRedeem)
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
