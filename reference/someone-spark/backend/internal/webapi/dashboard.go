package webapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"huohua/internal/billing"
	"huohua/internal/clock"
)

func (s *Server) dashboard(c *gin.Context) {
	u := currentUser(c)
	if u.Role == "admin" {
		fail(c, http.StatusForbidden, "forbidden", "请使用管理员看板")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	key := "dash:user:" + strconv.FormatInt(u.ID, 10)
	if raw, err := s.rdb.Get(ctx, key).Bytes(); err == nil && len(raw) > 0 {
		var data gin.H
		if json.Unmarshal(raw, &data) == nil {
			ok(c, data)
			return
		}
	}
	data, err := s.buildUserDash(ctx, u.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取看板失败")
		return
	}
	if b, err := json.Marshal(data); err == nil {
		_ = s.rdb.Set(ctx, key, b, 15*time.Second).Err()
	}
	ok(c, data)
}

func (s *Server) buildUserDash(ctx context.Context, userID int64) (gin.H, error) {
	ent, err := s.loadEntitlement(ctx, userID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	day := clock.LocalDate(now)
	from, to := clock.ShanghaiDayRange(now)
	var okN, failN int
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM send_jobs
		WHERE user_id = ? AND created_at >= ? AND created_at < ? AND dry_run = 0 AND status = 'ok'`,
		userID, from, to).Scan(&okN)
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM send_jobs
		WHERE user_id = ? AND created_at >= ? AND created_at < ? AND dry_run = 0 AND status = 'fail'`,
		userID, from, to).Scan(&failN)
	var expired, riskN int
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM douyin_accounts
		WHERE user_id = ? AND slot_status = 'active' AND session_status IN ('expired','unknown')`, userID).Scan(&expired)
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM douyin_accounts
		WHERE user_id = ? AND slot_status = 'active' AND session_status <> 'unbound'
		  AND risk_status <> '' AND (risk_until IS NULL OR risk_until > UTC_TIMESTAMP())`, userID).Scan(&riskN)
	todos := s.userTodos(ctx, userID, ent, day, now)
	accounts := s.userAccountRows(ctx, userID, day)
	series := s.userSendSeries(ctx, userID, now)
	return gin.H{
		"notice": s.setting("site.notice", ""),
		"cards": gin.H{
			"subscription": gin.H{
				"remaining_days": ent["remaining_days"],
				"source":         ent["source"],
				"ends_at":        ent["ends_at"],
				"plan_name":      ent["plan_name"],
				"valid":          ent["valid"],
			},
			"slots": gin.H{
				"bound": ent["bound_count"],
				"quota": ent["slot_quota"],
			},
			"today_send": gin.H{"ok": okN, "fail": failN},
			"anomalies":  gin.H{"expired_login": expired, "risk": riskN},
		},
		"todos":    todos,
		"accounts": accounts,
		"series":   series,
	}, nil
}

func (s *Server) userTodos(ctx context.Context, userID int64, ent gin.H, day string, now time.Time) []gin.H {
	out := make([]gin.H, 0, 8)
	quiet := clock.InQuiet(now, s.setting("send.quiet_start", "00:00"), s.setting("send.quiet_end", "07:00"))
	if rem, _ := ent["remaining_days"].(int); rem > 0 && rem <= 3 {
		if v, _ := ent["valid"].(bool); v {
			out = append(out, gin.H{
				"nickname": "", "type": "plan_soon", "message": "套餐剩余 " + strconv.Itoa(rem) + " 天",
				"action": "wallet", "href": "/wallet",
			})
		}
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT public_id, COALESCE(nickname,''), session_status, COALESCE(risk_status,''), risk_until
		FROM douyin_accounts WHERE user_id = ? AND slot_status = 'active'`, userID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		if len(out) >= 8 {
			break
		}
		var pid, nick, sess, risk string
		var until sql.NullTime
		if err := rows.Scan(&pid, &nick, &sess, &risk, &until); err != nil {
			break
		}
		label := nick
		if label == "" {
			label = "未绑定"
		}
		if sess == "expired" || sess == "unknown" {
			out = append(out, gin.H{"nickname": label, "type": "login_expired", "message": "登录失效，请重新绑定", "action": "bind", "href": "/douyin/" + pid})
		}
		paused := risk != "" && (!until.Valid || until.Time.After(now))
		if paused {
			out = append(out, gin.H{"nickname": label, "type": "risk", "message": "风控暂停，45 分钟后自动恢复", "action": "resume", "href": "/douyin/" + pid})
		}
		if quiet || sess != "valid" {
			continue
		}
		var pending int
		_ = s.db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM spark_tasks t
			JOIN friends f ON f.id = t.friend_id
			WHERE t.account_id = (SELECT id FROM douyin_accounts WHERE public_id = ?)
			  AND t.enabled = 1 AND f.spark_enabled = 1
			  AND NOT EXISTS (
			    SELECT 1 FROM send_uniques u WHERE u.account_id = t.account_id AND u.friend_id = t.friend_id AND u.local_date = ?
			  )`, pid, day).Scan(&pending)
		if pending > 0 {
			out = append(out, gin.H{"nickname": label, "type": "task_pending", "message": "今日有任务未发", "action": "tasks", "href": "/tasks?account=" + pid})
		}
	}
	if len(out) > 8 {
		out = out[:8]
	}
	return out
}

func (s *Server) userAccountRows(ctx context.Context, userID int64, day string) []gin.H {
	siteLim := s.settingInt("send.daily_limit", 20)
	hard := s.settingInt("send.hard_daily_cap", 20)
	var planLim sql.NullInt64
	_ = s.db.QueryRowContext(ctx, `
		SELECT p.daily_send_limit FROM subscriptions s
		JOIN plans p ON p.id = s.plan_id
		WHERE s.user_id = ? AND s.status = 'active' AND s.ends_at > UTC_TIMESTAMP()
		ORDER BY s.ends_at DESC LIMIT 1`, userID).Scan(&planLim)
	cap := billing.DailyCap(siteLim, hard, int(planLim.Int64))
	rows, err := s.db.QueryContext(ctx, `
		SELECT a.public_id, COALESCE(a.nickname,''), a.session_status, a.prefer_protocol, a.next_task_at,
		       COALESCE(c.sent_count, 0)
		FROM douyin_accounts a
		LEFT JOIN daily_send_counters c ON c.account_id = a.id AND c.local_date = ?
		WHERE a.user_id = ? AND a.slot_status = 'active'
		ORDER BY a.id`, day, userID)
	if err != nil {
		return []gin.H{}
	}
	defer rows.Close()
	protoOn := s.setting("send.protocol_enabled", "1") != "0"
	list := make([]gin.H, 0)
	for rows.Next() {
		var pid, nick, sess string
		var prefer bool
		var next sql.NullTime
		var sent int
		if err := rows.Scan(&pid, &nick, &sess, &prefer, &next, &sent); err != nil {
			break
		}
		ch := "浏览器"
		if prefer && protoOn {
			ch = "协议"
		}
		list = append(list, gin.H{
			"public_id":      pid,
			"nickname":       nick,
			"session_status": sess,
			"sent_today":     sent,
			"daily_cap":      cap,
			"next_task_at":   nullTime(next),
			"channel":        ch,
		})
	}
	return list
}

func (s *Server) userSendSeries(ctx context.Context, userID int64, now time.Time) []gin.H {
	loc := clock.Shanghai()
	t := now.In(loc)
	out := make([]gin.H, 0, 7)
	for i := 6; i >= 0; i-- {
		d := t.AddDate(0, 0, -i)
		date := d.Format("2006-01-02")
		from, to := clock.ShanghaiDayRange(d)
		var n int
		_ = s.db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM send_jobs
			WHERE user_id = ? AND status = 'ok' AND dry_run = 0 AND created_at >= ? AND created_at < ?`,
			userID, from, to).Scan(&n)
		out = append(out, gin.H{"date": date, "ok": n})
	}
	return out
}

func (s *Server) bustUserDash(userID int64) {
	_ = s.rdb.Del(context.Background(), "dash:user:"+strconv.FormatInt(userID, 10)).Err()
}
