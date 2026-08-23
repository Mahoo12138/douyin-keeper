package webapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func (s *Server) listLogs(c *gin.Context) {
	u := currentUser(c)
	accPID := c.Query("account")
	q := `
		SELECT sj.public_id, a.public_id, COALESCE(a.nickname,''), COALESCE(f.nickname, f.display_name, ''),
		       sj.channel, sj.kind, sj.dry_run, sj.body, sj.status, sj.error_code, sj.created_at
		FROM send_jobs sj
		JOIN douyin_accounts a ON a.id = sj.account_id
		LEFT JOIN friends f ON f.id = sj.friend_id
		WHERE sj.user_id = ?`
	args := []any{u.ID}
	if accPID != "" {
		a, err := s.loadOwnedAccount(c.Request.Context(), u.ID, accPID)
		if err != nil {
			fail(c, http.StatusNotFound, "not_found", "号位不存在")
			return
		}
		q += ` AND sj.account_id = ?`
		args = append(args, a.ID)
	}
	q += ` ORDER BY sj.created_at DESC LIMIT 100`
	rows, err := s.db.QueryContext(c.Request.Context(), q, args...)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取日志失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var jid, apid, anick, fnick, ch, kind, body, status, code string
		var dry bool
		var at time.Time
		if err := rows.Scan(&jid, &apid, &anick, &fnick, &ch, &kind, &dry, &body, &status, &code, &at); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取日志失败")
			return
		}
		list = append(list, gin.H{
			"public_id":    jid,
			"account":      apid,
			"account_name": anick,
			"friend_name":  fnick,
			"channel":      ch,
			"kind":         kind,
			"dry_run":      dry,
			"body":         body,
			"status":       status,
			"error_code":   code,
			"created_at":   at.UTC().Format(time.RFC3339),
		})
	}
	ok(c, gin.H{"logs": list})
}
