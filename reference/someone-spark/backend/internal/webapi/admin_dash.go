package webapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"

	"huohua/internal/clock"
	"huohua/internal/queue"
	"huohua/internal/sidecar"
)

func (s *Server) bustAdminDash() {
	_ = s.rdb.Del(context.Background(), "dash:admin").Err()
}

func (s *Server) adminDashboard(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	if raw, err := s.rdb.Get(ctx, "dash:admin").Bytes(); err == nil && len(raw) > 0 {
		var data gin.H
		if json.Unmarshal(raw, &data) == nil {
			ok(c, data)
			return
		}
	}
	data, err := s.buildAdminDash(ctx)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取看板失败")
		return
	}
	if b, err := json.Marshal(data); err == nil {
		_ = s.rdb.Set(ctx, "dash:admin", b, 30*time.Second).Err()
	}
	ok(c, data)
}

func (s *Server) buildAdminDash(ctx context.Context) (gin.H, error) {
	now := time.Now().UTC()
	from, to := clock.ShanghaiDayRange(now)
	var subs, regs, sendOK, sendFail int
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT user_id) FROM subscriptions
		WHERE status = 'active' AND ends_at > UTC_TIMESTAMP()`).Scan(&subs)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role = 'user' AND created_at >= ? AND created_at < ?`, from, to).Scan(&regs)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM send_jobs WHERE dry_run = 0 AND status = 'ok' AND created_at >= ? AND created_at < ?`, from, to).Scan(&sendOK)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM send_jobs WHERE dry_run = 0 AND status = 'fail' AND created_at >= ? AND created_at < ?`, from, to).Scan(&sendFail)
	var validN, badN, riskN, unusedKeys int
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM douyin_accounts WHERE slot_status = 'active' AND session_status = 'valid'`).Scan(&validN)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM douyin_accounts WHERE slot_status = 'active' AND session_status IN ('expired','unknown')`).Scan(&badN)
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM douyin_accounts
		WHERE slot_status = 'active' AND risk_status <> '' AND (risk_until IS NULL OR risk_until > UTC_TIMESTAMP())`).Scan(&riskN)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM card_keys WHERE status = 'unused'`).Scan(&unusedKeys)
	var income int64
	weekFrom, _ := clock.ShanghaiDayRange(now.Add(-6 * 24 * time.Hour))
	_ = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(-delta_cents), 0) FROM balance_ledgers
		WHERE type IN ('purchase_plan','purchase_slot') AND delta_cents < 0 AND created_at >= ?`, weekFrom).Scan(&income)
	var viol int
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM chat_messages WHERE review_flag = 'violation' AND reviewed_at IS NULL`).Scan(&viol)
	pending, active := s.queueStats()
	pyOK := true
	if _, _, err := sidecar.Ping(s.cfg); err != nil {
		pyOK = false
	}
	return gin.H{
		"cards": gin.H{
			"active_subscribers": subs,
			"today_register":     regs,
			"today_send_ok":      sendOK,
			"today_send_fail":    sendFail,
			"session_valid":      validN,
			"session_bad":        badN,
			"risk":               riskN,
			"unused_keys":        unusedKeys,
			"income_7d_cents":    income,
		},
		"series":     s.adminSeries(ctx, now),
		"risk_todos": s.adminRiskTodos(ctx, now),
		"queue":      gin.H{"pending": pending, "active": active},
		"violations": viol,
		"playwright": gin.H{"ok": pyOK},
	}, nil
}

func (s *Server) adminSeries(ctx context.Context, now time.Time) []gin.H {
	loc := clock.Shanghai()
	t := now.In(loc)
	out := make([]gin.H, 0, 7)
	for i := 6; i >= 0; i-- {
		d := t.AddDate(0, 0, -i)
		from, to := clock.ShanghaiDayRange(d)
		var sendN, regN int
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM send_jobs WHERE dry_run = 0 AND status = 'ok' AND created_at >= ? AND created_at < ?`, from, to).Scan(&sendN)
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role = 'user' AND created_at >= ? AND created_at < ?`, from, to).Scan(&regN)
		out = append(out, gin.H{"date": d.Format("2006-01-02"), "send_ok": sendN, "register": regN})
	}
	return out
}

func (s *Server) adminRiskTodos(ctx context.Context, now time.Time) []gin.H {
	rows, err := s.db.QueryContext(ctx, `
		SELECT COALESCE(u.email,''), a.public_id, COALESCE(a.nickname,''), COALESCE(a.risk_status,''), COALESCE(a.risk_reason,''), a.risk_until
		FROM douyin_accounts a
		JOIN users u ON u.id = a.user_id
		WHERE a.slot_status = 'active' AND a.risk_status <> '' AND (a.risk_until IS NULL OR a.risk_until > UTC_TIMESTAMP())
		ORDER BY a.updated_at DESC LIMIT 20`)
	if err != nil {
		return []gin.H{}
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var email, pid, nick, st, reason string
		var until sql.NullTime
		if err := rows.Scan(&email, &pid, &nick, &st, &reason, &until); err != nil {
			break
		}
		list = append(list, gin.H{
			"email":      MaskEmail(email),
			"public_id":  pid,
			"nickname":   nick,
			"risk":       st,
			"reason":     reason,
			"risk_until": nullTime(until),
		})
	}
	return list
}

func (s *Server) queueStats() (pending, active int) {
	insp := asynq.NewInspector(queue.RedisOpt(s.cfg))
	defer insp.Close()
	info, err := insp.GetQueueInfo("default")
	if err != nil {
		return 0, 0
	}
	return info.Pending, info.Active
}
