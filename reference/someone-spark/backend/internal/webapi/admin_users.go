package webapi

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func (s *Server) adminListUsers(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	st := strings.TrimSpace(c.Query("status"))
	sqlStr := `
		SELECT u.public_id, u.email, u.role, u.status, u.balance_cents, u.slot_quota, u.created_at,
		       s.ends_at, s.source
		FROM users u
		LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active' AND s.ends_at > UTC_TIMESTAMP()
		WHERE u.role = 'user'`
	args := []any{}
	if q != "" {
		sqlStr += ` AND (u.email LIKE ? OR u.public_id = ?)`
		args = append(args, "%"+q+"%", q)
	}
	if st == "active" || st == "disabled" {
		sqlStr += ` AND u.status = ?`
		args = append(args, st)
	}
	sqlStr += ` ORDER BY u.id DESC LIMIT 100`
	rows, err := s.db.QueryContext(c.Request.Context(), sqlStr, args...)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取用户失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var pid, email, role, status string
		var bal int64
		var quota int
		var created time.Time
		var ends sql.NullTime
		var source sql.NullString
		if err := rows.Scan(&pid, &email, &role, &status, &bal, &quota, &created, &ends, &source); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取用户失败")
			return
		}
		list = append(list, gin.H{
			"public_id":     pid,
			"email":         email,
			"status":        status,
			"balance_cents": bal,
			"slot_quota":    quota,
			"created_at":    created.UTC().Format(time.RFC3339),
			"ends_at":       nullTime(ends),
			"source":        nullStr(source),
		})
	}
	ok(c, gin.H{"users": list})
}

func (s *Server) adminGetUser(c *gin.Context) {
	u, err := s.loadUserByPublic(c.Param("id"))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "用户不存在")
		return
	}
	rows, err := s.db.QueryContext(c.Request.Context(), `
		SELECT public_id, COALESCE(nickname,''), session_status, COALESCE(risk_status,''), COALESCE(risk_reason,''), last_sync_at
		FROM douyin_accounts WHERE user_id = ? AND slot_status = 'active' ORDER BY id`, u.id)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取号位失败")
		return
	}
	defer rows.Close()
	slots := make([]gin.H, 0)
	for rows.Next() {
		var pid, nick, sess, risk, reason string
		var sync sql.NullTime
		if err := rows.Scan(&pid, &nick, &sess, &risk, &reason, &sync); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取号位失败")
			return
		}
		slots = append(slots, gin.H{
			"public_id": pid, "nickname": nick, "session_status": sess,
			"risk_status": risk, "risk_reason": reason, "last_sync_at": nullTime(sync),
		})
	}
	ok(c, gin.H{
		"public_id": u.publicID, "email": u.email, "status": u.status,
		"balance_cents": u.balance, "slot_quota": u.quota, "ends_at": u.ends, "source": u.source,
		"accounts": slots,
	})
}

type disableReq struct {
	Disabled bool `json:"disabled"`
}

func (s *Server) adminDisableUser(c *gin.Context) {
	target, err := s.loadUserByPublic(c.Param("id"))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "用户不存在")
		return
	}
	var req disableReq
	if !bindJSON(c, &req) {
		return
	}
	st := "active"
	if req.Disabled {
		st = "disabled"
	}
	if _, err := s.db.ExecContext(c.Request.Context(), `UPDATE users SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND role = 'user'`, st, target.id); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "更新失败")
		return
	}
	actor := currentUser(c)
	s.audit(c.Request.Context(), &actor.ID, "admin.user_disable", clientIP(c), gin.H{"user": target.publicID, "status": st})
	s.bustAdminDash()
	ok(c, gin.H{"status": st})
}

type adjustReq struct {
	DeltaCents int64  `json:"delta_cents"`
	Remark     string `json:"remark"`
}

func (s *Server) adminAdjustBalance(c *gin.Context) {
	target, err := s.loadUserByPublic(c.Param("id"))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "用户不存在")
		return
	}
	var req adjustReq
	if !bindJSON(c, &req) {
		return
	}
	if runeLen(strings.TrimSpace(req.Remark)) < 4 {
		fail(c, http.StatusBadRequest, "bad_request", "备注至少 4 个字")
		return
	}
	if req.DeltaCents == 0 {
		fail(c, http.StatusBadRequest, "bad_request", "变动不能为 0")
		return
	}
	const capCents int64 = 1000000
	if req.DeltaCents > capCents || req.DeltaCents < -capCents {
		fail(c, http.StatusBadRequest, "bad_request", "单次调余额上限 10000 元")
		return
	}
	ctx := c.Request.Context()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "调账失败")
		return
	}
	defer func() { _ = tx.Rollback() }()
	var bal int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_cents FROM users WHERE id = ? FOR UPDATE`, target.id).Scan(&bal); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "调账失败")
		return
	}
	next := bal + req.DeltaCents
	if next < 0 {
		fail(c, http.StatusBadRequest, "bad_request", "余额不足以下调")
		return
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET balance_cents = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`, next, target.id); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "调账失败")
		return
	}
	if err := insertLedger(ctx, tx, target.id, "admin_adjust", req.DeltaCents, next, strings.TrimSpace(req.Remark)); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "调账失败")
		return
	}
	if err := tx.Commit(); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "调账失败")
		return
	}
	actor := currentUser(c)
	s.audit(ctx, &actor.ID, "admin.balance_adjust", clientIP(c), gin.H{"user": target.publicID, "delta": req.DeltaCents})
	ok(c, gin.H{"balance_cents": next})
}

type adminUser struct {
	id       int64
	publicID string
	email    string
	status   string
	balance  int64
	quota    int
	ends     any
	source   any
}

func (s *Server) loadUserByPublic(pid string) (*adminUser, error) {
	var u adminUser
	var ends sql.NullTime
	var source sql.NullString
	err := s.db.QueryRow(`
		SELECT u.id, u.public_id, u.email, u.status, u.balance_cents, u.slot_quota, s.ends_at, s.source
		FROM users u
		LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active' AND s.ends_at > UTC_TIMESTAMP()
		WHERE u.public_id = ? AND u.role = 'user'`, pid).Scan(
		&u.id, &u.publicID, &u.email, &u.status, &u.balance, &u.quota, &ends, &source)
	if err != nil {
		return nil, err
	}
	u.ends = nullTime(ends)
	u.source = nullStr(source)
	return &u, nil
}
