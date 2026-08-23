package webapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"

	"huohua/internal/config"
	"huohua/internal/mailer"
)

type Server struct {
	cfg    *config.Config
	db     *sql.DB
	rdb    *redis.Client
	asynq  *asynq.Client
	mail   *mailer.Sender
	engine *gin.Engine
	http   *http.Server
}

func New(cfg *config.Config, db *sql.DB, rdb *redis.Client, ac *asynq.Client) *Server {
	if cfg.Production() {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(requestLog())
	s := &Server{cfg: cfg, db: db, rdb: rdb, asynq: ac, mail: mailer.New(cfg), engine: r}
	s.routes()
	s.http = &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      660 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	return s
}

func (s *Server) Engine() *gin.Engine { return s.engine }

func (s *Server) ListenAndServe() error {
	if err := s.engine.SetTrustedProxies(s.cfg.TrustedProxies); err != nil {
		return err
	}
	slog.Info("api listen", "addr", s.cfg.HTTPAddr)
	return s.http.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.http.Shutdown(ctx)
}

func (s *Server) routes() {
	s.engine.GET("/healthz", s.healthz)
	s.engine.GET("/readyz", s.readyz)
	v1 := s.engine.Group("/api/v1")
	v1.Use(s.limitBody(1 << 20))
	v1.GET("/csrf", s.issueCSRF)
	v1.GET("/public/site", s.publicSite)
	auth := v1.Group("/auth")
	auth.Use(s.requireCSRF())
	auth.POST("/register/send-code", s.sendRegisterCode)
	auth.POST("/register", s.register)
	auth.POST("/login", s.login)
	auth.POST("/logout", s.logout)
	auth.POST("/forgot/send-code", s.sendResetCode)
	auth.POST("/forgot/reset", s.resetPassword)
	me := v1.Group("")
	me.Use(s.requireSession(), s.rejectIfMaintenance())
	me.GET("/me", s.me)
	me.GET("/me/entitlement", s.entitlement)
	me.GET("/dashboard", s.dashboard)
	me.GET("/wallet", s.wallet)
	me.GET("/wallet/ledgers", s.walletLedgers)
	me.POST("/wallet/redeem", s.requireCSRF(), s.redeem)
	me.POST("/wallet/purchase", s.requireCSRF(), s.purchasePlan)
	me.POST("/wallet/slots", s.requireCSRF(), s.purchaseSlot)
	me.POST("/account/password", s.requireCSRF(), s.changePassword)
	me.GET("/douyin", s.listDouyin)
	me.GET("/douyin/:id", s.getDouyin)
	me.PATCH("/douyin/:id", s.requireCSRF(), s.patchDouyin)
	me.POST("/douyin/:id/unbind", s.requireCSRF(), s.unbindDouyin)
	me.POST("/douyin/:id/friends/sync", s.requireCSRF(), s.syncFriends)
	me.POST("/douyin/:id/chat/archive", s.requireCSRF(), s.archiveChat)
	me.GET("/friends", s.listFriends)
	me.PATCH("/friends/:id", s.requireCSRF(), s.patchFriend)
	me.POST("/friends/:id/send", s.requireCSRF(), s.sendToFriend)
	me.GET("/chat/messages", s.listMessages)
	me.GET("/stickers", s.listStickers)
	me.GET("/jobs/:id", s.getJob)
	me.GET("/tasks", s.listTasks)
	me.POST("/tasks", s.requireCSRF(), s.createTask)
	me.PATCH("/tasks/:id", s.requireCSRF(), s.patchTask)
	me.POST("/tasks/:id/run", s.requireCSRF(), s.runTask)
	me.GET("/logs", s.listLogs)
	me.POST("/douyin/:id/risk/resume", s.requireCSRF(), s.resumeRisk)
	me.POST("/douyin/:id/session/check", s.requireCSRF(), s.checkSession)
	me.POST("/douyin/:id/login/qr", s.requireCSRF(), s.startQR)
	me.POST("/douyin/:id/login/qr/sms", s.requireCSRF(), s.submitQRSms)
	me.POST("/douyin/:id/login/cancel", s.requireCSRF(), s.cancelLogin)
	me.GET("/douyin/:id/login/events", s.loginEvents)
	me.POST("/douyin/:id/login/sms/start", s.requireCSRF(), s.startSMS)
	me.POST("/douyin/:id/login/sms/verify", s.requireCSRF(), s.verifySMS)
	admin := v1.Group("/admin")
	admin.Use(s.requireSession(), s.requireAdmin())
	admin.GET("/dashboard", s.adminDashboard)
	admin.GET("/settings", s.adminGetSettings)
	admin.PUT("/settings", s.requireCSRF(), s.adminPutSettings)
	admin.GET("/users", s.adminListUsers)
	admin.GET("/users/:id", s.adminGetUser)
	admin.POST("/users/:id/disable", s.requireCSRF(), s.adminDisableUser)
	admin.POST("/users/:id/balance", s.requireCSRF(), s.adminAdjustBalance)
	admin.GET("/plans", s.adminListPlans)
	admin.POST("/plans", s.requireCSRF(), s.adminCreatePlan)
	admin.PATCH("/plans/:code", s.requireCSRF(), s.adminPatchPlan)
	admin.GET("/keys", s.adminListBatches)
	admin.GET("/keys/batches", s.adminListBatches)
	admin.POST("/keys", s.requireCSRF(), s.adminCreateKeys)
	admin.GET("/chat-review", s.adminListChat)
	admin.GET("/chat-review/:id", s.adminGetChat)
	admin.POST("/chat-review/:id/flag", s.requireCSRF(), s.adminFlagChat)
	admin.GET("/audit", s.adminListAudit)
	admin.POST("/login-rate/clear", s.requireCSRF(), s.adminClearLoginRate)
}

func requestLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		slog.Info("http",
			"method", c.Request.Method,
			"path", c.FullPath(),
			"status", c.Writer.Status(),
			"ms", time.Since(start).Milliseconds(),
			"ip", clientIP(c),
		)
	}
}

func (s *Server) limitBody(n int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, n)
		c.Next()
	}
}

func clientIP(c *gin.Context) string {
	ip := c.ClientIP()
	if host, _, err := net.SplitHostPort(ip); err == nil {
		return host
	}
	return ip
}

func ok(c *gin.Context, data any) {
	if data == nil {
		data = gin.H{}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": data})
}

func fail(c *gin.Context, status int, code, msg string) {
	c.JSON(status, gin.H{"ok": false, "error": gin.H{"code": code, "message": msg}})
}

func bindJSON(c *gin.Context, dst any) bool {
	dec := json.NewDecoder(c.Request.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		fail(c, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return false
	}
	return true
}

func readCookie(c *gin.Context, name string) string {
	v, err := c.Cookie(name)
	if err != nil {
		return ""
	}
	return v
}

func (s *Server) healthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s *Server) readyz(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	if err := s.db.PingContext(ctx); err != nil {
		fail(c, http.StatusServiceUnavailable, "not_ready", "数据库不可用")
		return
	}
	if err := s.rdb.Ping(ctx).Err(); err != nil {
		fail(c, http.StatusServiceUnavailable, "not_ready", "Redis 不可用")
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}

func (s *Server) publicSite(c *gin.Context) {
	name := s.setting("site.name", s.cfg.SiteName)
	ok(c, gin.H{
		"name":             name,
		"notice":           s.setting("site.notice", ""),
		"register_enabled": s.setting("register.enabled", "1") != "0",
		"seo_title":        s.setting("seo.title", name),
		"seo_description":  s.setting("seo.description", ""),
		"public_url":       s.cfg.SitePublicURL,
	})
}

func (s *Server) setting(k, def string) string {
	var v string
	err := s.db.QueryRow(`SELECT v FROM site_settings WHERE k = ?`, k).Scan(&v)
	if err != nil {
		return def
	}
	return v
}
