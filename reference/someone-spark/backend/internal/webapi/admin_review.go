package webapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

func (s *Server) adminListChat(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	flag := strings.TrimSpace(c.Query("flag"))
	sqlStr := `
		SELECT id, account_public_id, friend_display_name, direction, msg_type, body, review_flag, observed_at
		FROM chat_messages WHERE 1=1`
	args := []any{}
	acc := strings.TrimSpace(c.Query("account"))
	if flag == "pending" {
		sqlStr += ` AND review_flag = 'violation' AND reviewed_at IS NULL`
	} else if flag != "" && flag != "all" {
		sqlStr += ` AND review_flag = ?`
		args = append(args, flag)
	}
	if acc != "" {
		sqlStr += ` AND account_public_id = ?`
		args = append(args, acc)
	}
	if q != "" {
		sqlStr += ` AND (account_public_id = ? OR friend_display_name LIKE ?)`
		args = append(args, q, "%"+q+"%")
	}
	sqlStr += ` ORDER BY id DESC LIMIT 80`
	rows, err := s.db.QueryContext(c.Request.Context(), sqlStr, args...)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取归档失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var acc, friend, dir, typ, body, fl string
		var obs time.Time
		if err := rows.Scan(&id, &acc, &friend, &dir, &typ, &body, &fl, &obs); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取归档失败")
			return
		}
		list = append(list, gin.H{
			"id": id, "account_public_id": acc, "friend": friend,
			"direction": dir, "msg_type": typ, "preview": clipRunes(body, 40),
			"review_flag": fl, "observed_at": obs.UTC().Format(time.RFC3339),
		})
	}
	ok(c, gin.H{"messages": list})
}

func (s *Server) adminGetChat(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		fail(c, http.StatusBadRequest, "bad_request", "无效消息")
		return
	}
	var acc, friend, dir, typ, body, fl string
	var obs time.Time
	err = s.db.QueryRowContext(c.Request.Context(), `
		SELECT account_public_id, friend_display_name, direction, msg_type, body, review_flag, observed_at
		FROM chat_messages WHERE id = ?`, id).Scan(&acc, &friend, &dir, &typ, &body, &fl, &obs)
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "消息不存在")
		return
	}
	u := currentUser(c)
	filt, _ := json.Marshal(gin.H{"q": c.Query("q"), "flag": c.Query("flag")})
	_, _ = s.db.ExecContext(c.Request.Context(), `
		INSERT INTO chat_review_logs (actor_user_id, message_id, event, filter_json, created_at)
		VALUES (?, ?, 'read', ?, UTC_TIMESTAMP())`, u.ID, id, string(filt))
	s.audit(c.Request.Context(), &u.ID, "admin.chat_read", clientIP(c), gin.H{"message_id": id, "account": acc})
	ok(c, gin.H{
		"id": id, "account_public_id": acc, "friend": friend,
		"direction": dir, "msg_type": typ, "body": body,
		"review_flag": fl, "observed_at": obs.UTC().Format(time.RFC3339),
	})
}

type flagReq struct {
	Flag string `json:"flag"`
}

func (s *Server) adminFlagChat(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		fail(c, http.StatusBadRequest, "bad_request", "无效消息")
		return
	}
	var req flagReq
	if !bindJSON(c, &req) {
		return
	}
	fl := strings.ToLower(strings.TrimSpace(req.Flag))
	if fl != "violation" && fl != "benign" && fl != "none" {
		fail(c, http.StatusBadRequest, "bad_request", "标记须为 violation / benign / none")
		return
	}
	u := currentUser(c)
	if _, err := s.db.ExecContext(c.Request.Context(), `
		UPDATE chat_messages SET review_flag = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?`,
		fl, u.ID, id); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "标记失败")
		return
	}
	meta, _ := json.Marshal(gin.H{"flag": fl})
	_, _ = s.db.ExecContext(c.Request.Context(), `
		INSERT INTO chat_review_logs (actor_user_id, message_id, event, filter_json, created_at)
		VALUES (?, ?, 'flag', ?, UTC_TIMESTAMP())`, u.ID, id, string(meta))
	s.audit(c.Request.Context(), &u.ID, "admin.chat_flag", clientIP(c), gin.H{"message_id": id, "flag": fl})
	s.bustAdminDash()
	ok(c, gin.H{"id": id, "review_flag": fl})
}

func clipRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return string(r[:n]) + "…"
}
