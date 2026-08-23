package webapi

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func (s *Server) adminListPlans(c *gin.Context) {
	rows, err := s.db.QueryContext(c.Request.Context(), `
		SELECT code, name, duration_days, price_cents, daily_send_limit, is_active FROM plans ORDER BY id`)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取套餐失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var code, name string
		var days int
		var price int64
		var lim sql.NullInt64
		var active bool
		if err := rows.Scan(&code, &name, &days, &price, &lim, &active); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取套餐失败")
			return
		}
		var limit any
		if lim.Valid {
			limit = lim.Int64
		}
		list = append(list, gin.H{"code": code, "name": name, "duration_days": days, "price_cents": price, "daily_send_limit": limit, "is_active": active})
	}
	ok(c, gin.H{"plans": list})
}

type planReq struct {
	Code           string `json:"code"`
	Name           string `json:"name"`
	DurationDays   int    `json:"duration_days"`
	PriceCents     int64  `json:"price_cents"`
	DailySendLimit *int   `json:"daily_send_limit"`
	IsActive       *bool  `json:"is_active"`
}

func (s *Server) adminCreatePlan(c *gin.Context) {
	var req planReq
	if !bindJSON(c, &req) {
		return
	}
	code := strings.ToLower(strings.TrimSpace(req.Code))
	if code == "" || req.Name == "" || req.DurationDays < 1 || req.PriceCents < 0 {
		fail(c, http.StatusBadRequest, "bad_request", "套餐字段不完整")
		return
	}
	_, err := s.db.ExecContext(c.Request.Context(), `
		INSERT INTO plans (code, name, duration_days, price_cents, daily_send_limit, is_active)
		VALUES (?, ?, ?, ?, ?, 1)`, code, req.Name, req.DurationDays, req.PriceCents, req.DailySendLimit)
	if isDup(err) {
		fail(c, http.StatusConflict, "duplicate", "套餐编码已存在")
		return
	}
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "创建失败")
		return
	}
	actor := currentUser(c)
	s.audit(c.Request.Context(), &actor.ID, "admin.plan_create", clientIP(c), gin.H{"code": code})
	ok(c, gin.H{"code": code})
}

func (s *Server) adminPatchPlan(c *gin.Context) {
	code := strings.ToLower(c.Param("code"))
	var req planReq
	if !bindJSON(c, &req) {
		return
	}
	var name string
	var days int
	var price int64
	var lim sql.NullInt64
	var active bool
	err := s.db.QueryRowContext(c.Request.Context(), `SELECT name, duration_days, price_cents, daily_send_limit, is_active FROM plans WHERE code = ?`, code).Scan(&name, &days, &price, &lim, &active)
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "套餐不存在")
		return
	}
	if strings.TrimSpace(req.Name) != "" {
		name = strings.TrimSpace(req.Name)
	}
	if req.DurationDays > 0 {
		days = req.DurationDays
	}
	if req.PriceCents >= 0 && req.Name != "" {
		price = req.PriceCents
	}
	if req.PriceCents > 0 {
		price = req.PriceCents
	}
	var limit any
	if req.DailySendLimit != nil {
		limit = *req.DailySendLimit
	} else if lim.Valid {
		limit = lim.Int64
	}
	if req.IsActive != nil {
		active = *req.IsActive
	}
	if _, err := s.db.ExecContext(c.Request.Context(), `
		UPDATE plans SET name = ?, duration_days = ?, price_cents = ?, daily_send_limit = ?, is_active = ? WHERE code = ?`,
		name, days, price, limit, active, code); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "保存失败")
		return
	}
	actor := currentUser(c)
	s.audit(c.Request.Context(), &actor.ID, "admin.plan_update", clientIP(c), gin.H{"code": code})
	s.bustAdminDash()
	ok(c, gin.H{"code": code, "is_active": active})
}

func (s *Server) adminListBatches(c *gin.Context) {
	rows, err := s.db.QueryContext(c.Request.Context(), `
		SELECT b.public_id, b.kind, COALESCE(p.code,''), b.amount_cents, b.quantity, b.remark, b.created_at,
		       (SELECT COUNT(*) FROM card_keys k WHERE k.batch_id = b.id AND k.status = 'unused'),
		       (SELECT COUNT(*) FROM card_keys k WHERE k.batch_id = b.id AND k.status = 'used')
		FROM card_batches b
		LEFT JOIN plans p ON p.id = b.plan_id
		ORDER BY b.id DESC LIMIT 50`)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取卡密失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var pid, kind, plan, remark string
		var amount int64
		var qty, unused, used int
		var at time.Time
		if err := rows.Scan(&pid, &kind, &plan, &amount, &qty, &remark, &at, &unused, &used); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取卡密失败")
			return
		}
		list = append(list, gin.H{
			"public_id": pid, "kind": kind, "plan_code": plan, "amount_cents": amount,
			"quantity": qty, "unused": unused, "used": used, "remark": remark,
			"created_at": at.UTC().Format(time.RFC3339),
		})
	}
	ok(c, gin.H{"batches": list})
}

func (s *Server) adminListAudit(c *gin.Context) {
	ev := strings.TrimSpace(c.Query("event"))
	q := `SELECT COALESCE(u.email,''), a.event, a.ip, a.meta_json, a.created_at
		FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id`
	args := []any{}
	if ev != "" {
		q += ` WHERE a.event = ?`
		args = append(args, ev)
	}
	q += ` ORDER BY a.id DESC LIMIT 100`
	rows, err := s.db.QueryContext(c.Request.Context(), q, args...)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取审计失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var email, event, ip, meta string
		var at time.Time
		if err := rows.Scan(&email, &event, &ip, &meta, &at); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取审计失败")
			return
		}
		list = append(list, gin.H{
			"actor": MaskEmail(email), "event": event, "ip": ip, "meta": meta,
			"created_at": at.UTC().Format(time.RFC3339),
		})
	}
	ok(c, gin.H{"logs": list})
}

func (s *Server) adminClearLoginRate(c *gin.Context) {
	n, err := s.clearRateKeys(c.Request.Context(), "rl:qr:", "rl:sms:", "rl:smsv:")
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "解除限流失败")
		return
	}
	u := currentUser(c)
	s.audit(c.Request.Context(), &u.ID, "admin.login_rate_clear", clientIP(c), gin.H{"cleared": n})
	ok(c, gin.H{"cleared": n})
}
