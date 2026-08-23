package webapi

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"huohua/internal/id"
	"huohua/internal/queue"
)

func (s *Server) listTasks(c *gin.Context) {
	u := currentUser(c)
	accPID := c.Query("account")
	if accPID == "" {
		fail(c, http.StatusBadRequest, "bad_request", "请选择号位")
		return
	}
	a, err := s.loadOwnedAccount(c.Request.Context(), u.ID, accPID)
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "号位不存在")
		return
	}
	rows, err := s.db.QueryContext(c.Request.Context(), `
		SELECT t.public_id, f.public_id, f.nickname, f.display_name, t.body, t.sticker_key, t.enabled, t.last_enqueued_at
		FROM spark_tasks t
		JOIN friends f ON f.id = t.friend_id
		WHERE t.account_id = ? AND t.user_id = ?
		ORDER BY t.id ASC`, a.ID, u.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取任务失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var tpid, fpid, nick, display, body, sticker string
		var enabled bool
		var last sql.NullTime
		if err := rows.Scan(&tpid, &fpid, &nick, &display, &body, &sticker, &enabled, &last); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取任务失败")
			return
		}
		list = append(list, gin.H{
			"public_id":        tpid,
			"friend_id":        fpid,
			"friend_name":      nick,
			"display_name":     display,
			"body":             body,
			"sticker_key":      sticker,
			"enabled":          enabled,
			"last_enqueued_at": nullTime(last),
		})
	}
	ok(c, gin.H{"account": a.PublicID, "tasks": list})
}

type taskReq struct {
	Account    string `json:"account"`
	Friend     string `json:"friend"`
	Body       string `json:"body"`
	StickerKey string `json:"sticker_key"`
	Enabled    *bool  `json:"enabled"`
}

func (s *Server) createTask(c *gin.Context) {
	u := currentUser(c)
	var req taskReq
	if !bindJSON(c, &req) {
		return
	}
	a, err := s.loadOwnedAccount(c.Request.Context(), u.ID, strings.TrimSpace(req.Account))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "号位不存在")
		return
	}
	if !s.requirePlanAndSession(c, a) {
		return
	}
	f, acc, okF := s.loadOwnedFriend(c, u.ID, strings.TrimSpace(req.Friend))
	if !okF {
		return
	}
	if acc.ID != a.ID {
		fail(c, http.StatusBadRequest, "bad_request", "好友不属于该号")
		return
	}
	body := strings.TrimSpace(req.Body)
	if body == "" && req.StickerKey == "" {
		fail(c, http.StatusBadRequest, "bad_request", "请填写文案")
		return
	}
	_, err = s.db.ExecContext(c.Request.Context(), `
		INSERT INTO spark_tasks (public_id, user_id, account_id, friend_id, body, sticker_key, enabled, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
		id.New(), u.ID, a.ID, f.id, body, strings.TrimSpace(req.StickerKey))
	if isDup(err) {
		fail(c, http.StatusConflict, "duplicate", "该好友已有一条任务")
		return
	}
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "创建失败")
		return
	}
	s.bustUserDash(u.ID)
	ok(c, gin.H{"created": true})
}

func (s *Server) patchTask(c *gin.Context) {
	u := currentUser(c)
	t, _, okT := s.loadOwnedTask(c, u.ID, c.Param("id"))
	if !okT {
		return
	}
	var req taskReq
	if !bindJSON(c, &req) {
		return
	}
	body := t.body
	sticker := t.sticker
	enabled := t.enabled
	if strings.TrimSpace(req.Body) != "" {
		body = strings.TrimSpace(req.Body)
	}
	if req.StickerKey != "" || req.Body != "" {
		sticker = strings.TrimSpace(req.StickerKey)
	}
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	if _, err := s.db.ExecContext(c.Request.Context(), `
		UPDATE spark_tasks SET body = ?, sticker_key = ?, enabled = ?, updated_at = UTC_TIMESTAMP()
		WHERE id = ? AND user_id = ?`, body, sticker, enabled, t.id, u.ID); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "保存失败")
		return
	}
	s.bustUserDash(u.ID)
	ok(c, gin.H{"public_id": t.publicID, "enabled": enabled})
}

func (s *Server) runTask(c *gin.Context) {
	u := currentUser(c)
	t, a, okT := s.loadOwnedTask(c, u.ID, c.Param("id"))
	if !okT {
		return
	}
	if !s.requirePlanAndSession(c, a) {
		return
	}
	jobID, err := s.enqueueAccountJob(c, a, queue.TypeChatSend, queue.AccountJob{
		FriendID:   t.friendID,
		FriendName: t.friendName,
		Body:       t.body,
		StickerKey: t.sticker,
		Kind:       taskKind(t.sticker),
		DryRun:     true,
	})
	if err != nil {
		fail(c, http.StatusServiceUnavailable, "queue", "无法试跑")
		return
	}
	ok(c, gin.H{"job_id": jobID, "dry_run": true})
}

func (s *Server) resumeRisk(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	if _, err := s.db.ExecContext(c.Request.Context(), `
		UPDATE douyin_accounts
		SET risk_status = '', risk_reason = '', risk_until = NULL, consecutive_fails = 0, updated_at = UTC_TIMESTAMP()
		WHERE id = ? AND user_id = ?`, a.ID, currentUser(c).ID); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "恢复失败")
		return
	}
	s.bustUserDash(currentUser(c).ID)
	ok(c, gin.H{"resumed": true})
}

type ownedTask struct {
	id, friendID  int64
	publicID      string
	body, sticker string
	friendName    string
	enabled       bool
}

func (s *Server) loadOwnedTask(c *gin.Context, userID int64, publicID string) (*ownedTask, *dyAccount, bool) {
	var t ownedTask
	var accPID string
	err := s.db.QueryRowContext(c.Request.Context(), `
		SELECT t.id, t.public_id, t.friend_id, t.body, t.sticker_key, t.enabled, f.display_name, a.public_id
		FROM spark_tasks t
		JOIN friends f ON f.id = t.friend_id
		JOIN douyin_accounts a ON a.id = t.account_id
		WHERE t.public_id = ? AND t.user_id = ?`, publicID, userID).Scan(
		&t.id, &t.publicID, &t.friendID, &t.body, &t.sticker, &t.enabled, &t.friendName, &accPID)
	if err == sql.ErrNoRows {
		fail(c, http.StatusNotFound, "not_found", "任务不存在")
		return nil, nil, false
	}
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取任务失败")
		return nil, nil, false
	}
	a, err := s.loadOwnedAccount(c.Request.Context(), userID, accPID)
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "号位不存在")
		return nil, nil, false
	}
	return &t, a, true
}

func taskKind(sticker string) string {
	if sticker != "" {
		return "sticker"
	}
	return "text"
}
