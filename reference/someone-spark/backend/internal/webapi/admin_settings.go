package webapi

import (
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"huohua/internal/mailer"
)

var settingKeys = []string{
	"site.name", "site.notice", "site.maintenance",
	"register.enabled", "register.trial_days",
	"seo.title", "seo.description",
	"billing.add_account_price_cents",
	"douyin.max_accounts_per_user",
	"send.protocol_enabled", "send.daily_limit", "send.first_message_daily_limit", "send.hard_daily_cap",
	"send.quiet_start", "send.quiet_end",
	"worker.max_browsers",
	"smtp.host", "smtp.port", "smtp.user", "smtp.from",
}

func (s *Server) adminGetSettings(c *gin.Context) {
	out := gin.H{}
	for _, k := range settingKeys {
		out[k] = s.setting(k, defaultSetting(k))
	}
	out["smtp.has_password"] = s.setting("smtp.password", "") != ""
	ok(c, out)
}

func (s *Server) adminPutSettings(c *gin.Context) {
	var req map[string]string
	if !bindJSON(c, &req) {
		return
	}
	allowed := map[string]bool{}
	for _, k := range settingKeys {
		allowed[k] = true
	}
	allowed["smtp.password"] = true
	ctx := c.Request.Context()
	changed := 0
	for k, v := range req {
		if !allowed[k] {
			fail(c, http.StatusBadRequest, "bad_request", "不允许的设置项")
			return
		}
		if k == "smtp.password" && strings.TrimSpace(v) == "" {
			continue
		}
		if err := s.upsertSetting(k, v); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "保存失败")
			return
		}
		changed++
	}
	s.bustAdminDash()
	u := currentUser(c)
	s.audit(ctx, &u.ID, "admin.settings", clientIP(c), gin.H{"changed": changed})
	ok(c, gin.H{"saved": true})
}

func (s *Server) siteSMTP() mailer.SMTP {
	port := 0
	if v := strings.TrimSpace(s.setting("smtp.port", "")); v != "" {
		port, _ = strconv.Atoi(v)
	}
	return mailer.SMTP{
		Host:     strings.TrimSpace(s.setting("smtp.host", "")),
		Port:     port,
		User:     strings.TrimSpace(s.setting("smtp.user", "")),
		Password: s.setting("smtp.password", ""),
		From:     strings.TrimSpace(s.setting("smtp.from", "")),
	}
}

func (s *Server) upsertSetting(k, v string) error {
	_, err := s.db.Exec(`
		INSERT INTO site_settings (k, v, updated_at) VALUES (?, ?, UTC_TIMESTAMP())
		ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = UTC_TIMESTAMP()`, k, v)
	return err
}

func defaultSetting(k string) string {
	switch k {
	case "register.enabled", "send.protocol_enabled":
		return "1"
	case "site.maintenance":
		return "0"
	case "register.trial_days":
		return "0"
	case "send.quiet_start":
		return "00:00"
	case "send.quiet_end":
		return "07:00"
	case "send.hard_daily_cap", "send.daily_limit":
		return "20"
	case "send.first_message_daily_limit":
		return "5"
	case "douyin.max_accounts_per_user":
		return "10"
	case "billing.add_account_price_cents":
		return "3000"
	case "worker.max_browsers":
		return "2"
	case "smtp.port":
		return "587"
	default:
		return ""
	}
}

func (s *Server) rejectIfMaintenance() gin.HandlerFunc {
	return func(c *gin.Context) {
		if s.setting("site.maintenance", "0") != "1" {
			c.Next()
			return
		}
		u := currentUser(c)
		if u != nil && u.Role == "admin" {
			c.Next()
			return
		}
		if c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead {
			c.Next()
			return
		}
		p := c.FullPath()
		if strings.Contains(p, "/wallet/") || strings.Contains(p, "/auth/logout") {
			c.Next()
			return
		}
		fail(c, http.StatusServiceUnavailable, "maintenance", "站点维护中")
		c.Abort()
	}
}

func runeLen(s string) int { return utf8.RuneCountInString(s) }
