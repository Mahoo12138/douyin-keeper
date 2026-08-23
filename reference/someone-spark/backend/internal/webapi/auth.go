package webapi

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"

	"huohua/internal/clock"
	"huohua/internal/id"
	"huohua/internal/mailer"
	"huohua/internal/password"
)

type emailReq struct {
	Email string `json:"email"`
}

type registerReq struct {
	Email    string `json:"email"`
	Code     string `json:"code"`
	Password string `json:"password"`
	Agree    bool   `json:"agree"`
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type resetReq struct {
	Email    string `json:"email"`
	Code     string `json:"code"`
	Password string `json:"password"`
}

type changePassReq struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

func normalizeEmail(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func validEmail(s string) bool {
	if len(s) < 5 || len(s) > 255 || !strings.Contains(s, "@") {
		return false
	}
	at := strings.LastIndex(s, "@")
	if at < 1 || at == len(s)-1 {
		return false
	}
	for _, r := range s {
		if unicode.IsSpace(r) {
			return false
		}
	}
	return true
}

func (s *Server) allowRate(c *gin.Context, key string, limit int, ttl time.Duration) bool {
	return s.allowRateNamed(c, key, limit, ttl, "rate_limited", "尝试过于频繁，请 %d 秒后再试")
}

func (s *Server) allowRateNamed(c *gin.Context, key string, limit int, ttl time.Duration, code, tmpl string) bool {
	ctx := c.Request.Context()
	n, err := s.rdb.Incr(ctx, key).Result()
	if err != nil {
		fail(c, http.StatusServiceUnavailable, "rate", "限流服务不可用")
		return false
	}
	if n == 1 {
		_ = s.rdb.Expire(ctx, key, ttl).Err()
	}
	if n > int64(limit) {
		wait := int(s.rdb.TTL(ctx, key).Val().Seconds())
		if wait < 1 {
			wait = 1
		}
		if !strings.Contains(tmpl, "%d") {
			tmpl = tmpl + "，请 %d 秒后再试"
		}
		fail(c, http.StatusTooManyRequests, code, fmt.Sprintf(tmpl, wait))
		return false
	}
	return true
}

func (s *Server) clearRateKeys(ctx context.Context, prefixes ...string) (int64, error) {
	var all []string
	for _, p := range prefixes {
		keys, err := s.rdb.Keys(ctx, p+"*").Result()
		if err != nil {
			return 0, err
		}
		all = append(all, keys...)
	}
	if len(all) == 0 {
		return 0, nil
	}
	return s.rdb.Del(ctx, all...).Result()
}

func (s *Server) sendRegisterCode(c *gin.Context) {
	var req emailReq
	if !bindJSON(c, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	if !validEmail(email) {
		fail(c, http.StatusBadRequest, "bad_email", "邮箱格式不正确")
		return
	}
	if s.setting("register.enabled", "1") == "0" {
		fail(c, http.StatusForbidden, "register_closed", "注册已关闭")
		return
	}
	if !s.allowRate(c, "rl:code:ip:"+clientIP(c), 10, time.Hour) {
		return
	}
	if !s.allowRate(c, "rl:code:email:"+email, 5, time.Hour) {
		return
	}
	if err := s.issueEmailCode(c.Request.Context(), email, "register"); err != nil {
		slogErr(c, err)
		fail(c, http.StatusInternalServerError, "internal", "验证码发送失败")
		return
	}
	ok(c, gin.H{"sent": true})
}

func (s *Server) sendResetCode(c *gin.Context) {
	var req emailReq
	if !bindJSON(c, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	if !validEmail(email) {
		fail(c, http.StatusBadRequest, "bad_email", "邮箱格式不正确")
		return
	}
	if !s.allowRate(c, "rl:reset:ip:"+clientIP(c), 10, time.Hour) {
		return
	}
	var exists int
	_ = s.db.QueryRowContext(c.Request.Context(), `SELECT 1 FROM users WHERE email = ? LIMIT 1`, email).Scan(&exists)
	if exists == 1 {
		if err := s.issueEmailCode(c.Request.Context(), email, "reset"); err != nil {
			slogErr(c, err)
			fail(c, http.StatusInternalServerError, "internal", "验证码发送失败")
			return
		}
	}
	ok(c, gin.H{"sent": true})
}

func (s *Server) issueEmailCode(ctx context.Context, email, purpose string) error {
	code, err := mailer.RandomCode()
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO email_codes (email, purpose, code_hash, expires_at, created_at)
		VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), UTC_TIMESTAMP())`,
		email, purpose, mailer.HashCode(code))
	if err != nil {
		return err
	}
	if err := s.mail.SendCode(email, purpose, code, s.siteSMTP()); err != nil {
		slog.Error("mail send failed", "purpose", purpose, "err", err)
		return err
	}
	return nil
}

func (s *Server) consumeCode(ctx context.Context, tx *sql.Tx, email, purpose, code string) error {
	var id int64
	var hash string
	err := tx.QueryRowContext(ctx, `
		SELECT id, code_hash FROM email_codes
		WHERE email = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP()
		ORDER BY id DESC LIMIT 1 FOR UPDATE`, email, purpose).Scan(&id, &hash)
	if err != nil {
		return errInvalidCode
	}
	want := mailer.HashCode(strings.TrimSpace(code))
	if subtle.ConstantTimeCompare([]byte(want), []byte(hash)) != 1 {
		return errInvalidCode
	}
	_, err = tx.ExecContext(ctx, `UPDATE email_codes SET consumed_at = UTC_TIMESTAMP() WHERE id = ?`, id)
	return err
}

var errInvalidCode = errString("invalid code")

func (s *Server) register(c *gin.Context) {
	var req registerReq
	if !bindJSON(c, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	if !validEmail(email) {
		fail(c, http.StatusBadRequest, "bad_email", "邮箱格式不正确")
		return
	}
	if !req.Agree {
		fail(c, http.StatusBadRequest, "agree", "请勾选风险提示")
		return
	}
	if s.setting("register.enabled", "1") == "0" {
		fail(c, http.StatusForbidden, "register_closed", "注册已关闭")
		return
	}
	if err := password.Validate(req.Password); err != nil {
		fail(c, http.StatusBadRequest, "bad_password", err.Error())
		return
	}
	if !s.allowRate(c, "rl:register:ip:"+clientIP(c), 8, time.Hour) {
		return
	}
	hash, err := password.Hash(req.Password)
	if err != nil {
		fail(c, http.StatusBadRequest, "bad_password", err.Error())
		return
	}
	ctx := c.Request.Context()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "注册失败")
		return
	}
	defer func() { _ = tx.Rollback() }()
	if err := s.consumeCode(ctx, tx, email, "register", req.Code); err != nil {
		fail(c, http.StatusBadRequest, "bad_code", "验证码无效或已过期")
		return
	}
	publicID := id.New()
	res, err := tx.ExecContext(ctx, `
		INSERT INTO users (public_id, email, password_hash, role, status, balance_cents, slot_quota, created_at, updated_at)
		VALUES (?, ?, ?, 'user', 'active', 0, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())`, publicID, email, hash)
	if err != nil {
		if isDup(err) {
			fail(c, http.StatusConflict, "email_taken", "该邮箱已注册")
			return
		}
		slogErr(c, err)
		fail(c, http.StatusInternalServerError, "internal", "注册失败")
		return
	}
	uid, _ := res.LastInsertId()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO douyin_accounts (user_id, public_id, session_status, slot_status, created_at, updated_at)
		VALUES (?, ?, 'unbound', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())`, uid, id.New())
	if err != nil {
		slogErr(c, err)
		fail(c, http.StatusInternalServerError, "internal", "注册失败")
		return
	}
	if err := s.maybeTrial(ctx, tx, uid); err != nil {
		slogErr(c, err)
		fail(c, http.StatusInternalServerError, "internal", "注册失败")
		return
	}
	if err := tx.Commit(); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "注册失败")
		return
	}
	s.audit(ctx, &uid, "auth.register", clientIP(c), gin.H{"email": email})
	if err := s.createSession(c, uid); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "登录会话创建失败")
		return
	}
	ok(c, gin.H{"role": "user", "redirect": "/dashboard"})
}

func (s *Server) maybeTrial(ctx context.Context, tx *sql.Tx, userID int64) error {
	var raw string
	if err := tx.QueryRowContext(ctx, `SELECT v FROM site_settings WHERE k = 'register.trial_days'`).Scan(&raw); err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return err
	}
	days, _ := strconv.Atoi(strings.TrimSpace(raw))
	if days <= 0 {
		return nil
	}
	var planID int64
	if err := tx.QueryRowContext(ctx, `SELECT id FROM plans WHERE code = 'trial'`).Scan(&planID); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO subscriptions (user_id, plan_id, starts_at, ends_at, status, source, created_at, updated_at)
		VALUES (?, ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY), 'active', 'trial', UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
		userID, planID, days)
	return err
}

func (s *Server) login(c *gin.Context) {
	var req loginReq
	if !bindJSON(c, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	if !s.allowRate(c, "rl:login:ip:"+clientIP(c), 20, 15*time.Minute) {
		return
	}
	if email != "" && !s.allowRate(c, "rl:login:email:"+email, 10, 15*time.Minute) {
		return
	}
	var uid int64
	var hash, role, status string
	err := s.db.QueryRowContext(c.Request.Context(), `
		SELECT id, password_hash, role, status FROM users WHERE email = ?`, email).Scan(&uid, &hash, &role, &status)
	if err != nil {
		s.audit(c.Request.Context(), nil, "auth.login_fail", clientIP(c), gin.H{"email": email})
		fail(c, http.StatusUnauthorized, "bad_credentials", "邮箱或密码错误")
		return
	}
	okPass, err := password.Verify(req.Password, hash)
	if err != nil || !okPass {
		s.audit(c.Request.Context(), &uid, "auth.login_fail", clientIP(c), gin.H{"email": email})
		fail(c, http.StatusUnauthorized, "bad_credentials", "邮箱或密码错误")
		return
	}
	if status != "active" {
		fail(c, http.StatusForbidden, "disabled", "账号已停用")
		return
	}
	if err := s.createSession(c, uid); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "登录失败")
		return
	}
	s.audit(c.Request.Context(), &uid, "auth.login", clientIP(c), gin.H{"email": email})
	redirect := "/dashboard"
	if role == "admin" {
		redirect = "/admin/dashboard"
	}
	ok(c, gin.H{"role": role, "redirect": redirect})
}

func (s *Server) logout(c *gin.Context) {
	raw := readCookie(c, cookieSession)
	if raw != "" {
		_, _ = s.db.ExecContext(c.Request.Context(),
			`UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = ? AND revoked_at IS NULL`, hashToken(raw))
	}
	s.setCookies(c, "", "", -1)
	ok(c, gin.H{})
}

func (s *Server) resetPassword(c *gin.Context) {
	var req resetReq
	if !bindJSON(c, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	if err := password.Validate(req.Password); err != nil {
		fail(c, http.StatusBadRequest, "bad_password", err.Error())
		return
	}
	hash, err := password.Hash(req.Password)
	if err != nil {
		fail(c, http.StatusBadRequest, "bad_password", err.Error())
		return
	}
	ctx := c.Request.Context()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "重置失败")
		return
	}
	defer func() { _ = tx.Rollback() }()
	if err := s.consumeCode(ctx, tx, email, "reset", req.Code); err != nil {
		fail(c, http.StatusBadRequest, "bad_code", "验证码无效或已过期")
		return
	}
	res, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = ?, updated_at = UTC_TIMESTAMP() WHERE email = ?`, hash, email)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "重置失败")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		fail(c, http.StatusBadRequest, "bad_code", "验证码无效或已过期")
		return
	}
	var uid int64
	_ = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE email = ?`, email).Scan(&uid)
	_, _ = tx.ExecContext(ctx, `UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL`, uid)
	if err := tx.Commit(); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "重置失败")
		return
	}
	ok(c, gin.H{})
}

func (s *Server) changePassword(c *gin.Context) {
	u := currentUser(c)
	var req changePassReq
	if !bindJSON(c, &req) {
		return
	}
	if err := password.Validate(req.NewPassword); err != nil {
		fail(c, http.StatusBadRequest, "bad_password", err.Error())
		return
	}
	var hash string
	if err := s.db.QueryRowContext(c.Request.Context(), `SELECT password_hash FROM users WHERE id = ?`, u.ID).Scan(&hash); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "修改失败")
		return
	}
	okPass, err := password.Verify(req.OldPassword, hash)
	if err != nil || !okPass {
		fail(c, http.StatusBadRequest, "bad_password", "当前密码不正确")
		return
	}
	nh, err := password.Hash(req.NewPassword)
	if err != nil {
		fail(c, http.StatusBadRequest, "bad_password", err.Error())
		return
	}
	_, err = s.db.ExecContext(c.Request.Context(), `UPDATE users SET password_hash = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`, nh, u.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "修改失败")
		return
	}
	_, _ = s.db.ExecContext(c.Request.Context(), `UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL`, u.ID)
	if err := s.createSession(c, u.ID); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "修改失败")
		return
	}
	ok(c, gin.H{})
}

func (s *Server) createSession(c *gin.Context, userID int64) error {
	raw, err := randomToken()
	if err != nil {
		return err
	}
	csrf, err := randomToken()
	if err != nil {
		return err
	}
	ua := c.Request.UserAgent()
	if len(ua) > 255 {
		ua = ua[:255]
	}
	_, err = s.db.ExecContext(c.Request.Context(), `
		INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, ip, user_agent, created_at)
		VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 DAY), ?, ?, UTC_TIMESTAMP())`,
		userID, hashToken(raw), hashToken(csrf), clientIP(c), ua)
	if err != nil {
		return err
	}
	s.setCookies(c, raw, csrf, 14*24*3600)
	return nil
}

func (s *Server) me(c *gin.Context) {
	u := currentUser(c)
	ok(c, gin.H{
		"public_id": u.PublicID,
		"email":     u.Email,
		"role":      u.Role,
	})
}

func (s *Server) entitlement(c *gin.Context) {
	u := currentUser(c)
	data, err := s.loadEntitlement(c.Request.Context(), u.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取权益失败")
		return
	}
	ok(c, data)
}

func (s *Server) loadEntitlement(ctx context.Context, userID int64) (gin.H, error) {
	var quota int
	var balance int64
	if err := s.db.QueryRowContext(ctx, `SELECT slot_quota, balance_cents FROM users WHERE id = ?`, userID).Scan(&quota, &balance); err != nil {
		return nil, err
	}
	var bound int
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM douyin_accounts
		WHERE user_id = ? AND slot_status = 'active' AND session_status <> 'unbound'`, userID).Scan(&bound)
	var planName, planCode, source string
	var endsAt sql.NullTime
	var status string
	err := s.db.QueryRowContext(ctx, `
		SELECT p.name, p.code, s.source, s.ends_at, s.status
		FROM subscriptions s
		JOIN plans p ON p.id = s.plan_id
		WHERE s.user_id = ? AND s.status = 'active'
		ORDER BY s.ends_at DESC LIMIT 1`, userID).Scan(&planName, &planCode, &source, &endsAt, &status)
	now := time.Now().UTC()
	valid := false
	remaining := 0
	var ends any
	if err == nil && endsAt.Valid && status == "active" && endsAt.Time.After(now) {
		valid = true
		remaining = clock.RemainingDays(now, endsAt.Time)
		ends = endsAt.Time.UTC().Format(time.RFC3339)
	} else {
		planName, planCode, source = "", "", ""
		ends = nil
	}
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	return gin.H{
		"valid":          valid,
		"plan_code":      planCode,
		"plan_name":      planName,
		"source":         source,
		"ends_at":        ends,
		"remaining_days": remaining,
		"is_trial":       source == "trial",
		"slot_quota":     quota,
		"bound_count":    bound,
		"balance_cents":  balance,
	}, nil
}

func (s *Server) audit(ctx context.Context, uid *int64, event, ip string, meta gin.H) {
	b, _ := json.Marshal(meta)
	var arg any
	if uid != nil {
		arg = *uid
	}
	_, _ = s.db.ExecContext(ctx, `INSERT INTO audit_logs (actor_user_id, event, ip, meta_json, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`, arg, event, ip, string(b))
}

func isDup(err error) bool {
	return err != nil && strings.Contains(err.Error(), "Duplicate")
}

func slogErr(c *gin.Context, err error) {
	if err != nil {
		slog.Error("request failed", "path", c.FullPath(), "err", err)
		_ = c.Error(err)
	}
}

func (s *Server) requireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		u := currentUser(c)
		if u == nil || u.Role != "admin" {
			fail(c, http.StatusForbidden, "forbidden", "需要管理员权限")
			c.Abort()
			return
		}
		c.Next()
	}
}
