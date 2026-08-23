package webapi

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"

	"huohua/internal/queue"
)

func (s *Server) requirePlanAndSession(c *gin.Context, a *dyAccount) bool {
	if !a.HasSession || a.SessionStatus != "valid" {
		fail(c, http.StatusConflict, "no_session", "请先登录该号")
		return false
	}
	valid, err := s.planValid(c)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取套餐失败")
		return false
	}
	if !valid {
		fail(c, http.StatusForbidden, "plan_required", "套餐无效，无法同步或发送")
		return false
	}
	return true
}

func (s *Server) syncFriends(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	if !s.requirePlanAndSession(c, a) {
		return
	}
	jobID, err := s.enqueueAccountJob(c, a, queue.TypeFriendsSync, queue.AccountJob{})
	if err != nil {
		fail(c, http.StatusServiceUnavailable, "queue", "无法同步好友")
		return
	}
	ok(c, gin.H{"job_id": jobID})
}

func (s *Server) listFriends(c *gin.Context) {
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
		SELECT public_id, display_name, nickname, short_id, avatar_url, streak_days,
		       has_conversation, spark_enabled, allow_first_message, last_sent_at
		FROM friends WHERE account_id = ? ORDER BY id ASC`, a.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取好友失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var pid, display, nick, short, avatar string
		var streak int
		var hasConv, spark bool
		var allow sql.NullBool
		var last sql.NullTime
		if err := rows.Scan(&pid, &display, &nick, &short, &avatar, &streak, &hasConv, &spark, &allow, &last); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取好友失败")
			return
		}
		var allowV any
		if allow.Valid {
			allowV = allow.Bool
		}
		list = append(list, gin.H{
			"public_id":           pid,
			"display_name":        display,
			"nickname":            nick,
			"short_id":            short,
			"avatar_url":          avatar,
			"streak_days":         streak,
			"has_conversation":    hasConv,
			"spark_enabled":       spark,
			"allow_first_message": allowV,
			"last_sent_at":        nullTime(last),
		})
	}
	ok(c, gin.H{"account": a.PublicID, "friends": list})
}

type patchFriendReq struct {
	SparkEnabled      *bool `json:"spark_enabled"`
	AllowFirstMessage *bool `json:"allow_first_message"`
}

func (s *Server) patchFriend(c *gin.Context) {
	u := currentUser(c)
	f, a, okF := s.loadOwnedFriend(c, u.ID, c.Param("id"))
	if !okF {
		return
	}
	var req patchFriendReq
	if !bindJSON(c, &req) {
		return
	}
	spark := f.spark
	if req.SparkEnabled != nil {
		spark = *req.SparkEnabled
	}
	var allow any
	if req.AllowFirstMessage != nil {
		allow = *req.AllowFirstMessage
	} else if f.allow.Valid {
		allow = f.allow.Bool
	}
	if _, err := s.db.ExecContext(c.Request.Context(), `
		UPDATE friends SET spark_enabled = ?, allow_first_message = ?, updated_at = UTC_TIMESTAMP()
		WHERE id = ? AND account_id = ?`, spark, allow, f.id, a.ID); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "保存失败")
		return
	}
	ok(c, gin.H{"public_id": f.publicID, "spark_enabled": spark, "allow_first_message": allow})
}

type ownedFriend struct {
	id       int64
	publicID string
	name     string
	hasConv  bool
	spark    bool
	allow    sql.NullBool
}

func (s *Server) loadOwnedFriend(c *gin.Context, userID int64, friendPID string) (*ownedFriend, *dyAccount, bool) {
	var f ownedFriend
	var accPID string
	err := s.db.QueryRowContext(c.Request.Context(), `
		SELECT f.id, f.public_id, f.display_name, f.has_conversation, f.spark_enabled, f.allow_first_message, a.public_id
		FROM friends f
		JOIN douyin_accounts a ON a.id = f.account_id
		WHERE f.public_id = ? AND a.user_id = ? AND a.slot_status = 'active'`, friendPID, userID).Scan(
		&f.id, &f.publicID, &f.name, &f.hasConv, &f.spark, &f.allow, &accPID)
	if err == sql.ErrNoRows {
		fail(c, http.StatusNotFound, "not_found", "好友不存在")
		return nil, nil, false
	}
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取好友失败")
		return nil, nil, false
	}
	a, err := s.loadOwnedAccount(c.Request.Context(), userID, accPID)
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "号位不存在")
		return nil, nil, false
	}
	return &f, a, true
}

func (s *Server) listStickers(c *gin.Context) {
	u := currentUser(c)
	accPID := c.Query("account")
	a, err := s.loadOwnedAccount(c.Request.Context(), u.ID, accPID)
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "号位不存在")
		return
	}
	rows, err := s.db.QueryContext(c.Request.Context(), `
		SELECT sticker_key, name, preview_url FROM stickers_cache WHERE account_id = ? ORDER BY sticker_key`, a.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取表情失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var key, name, prev string
		if err := rows.Scan(&key, &name, &prev); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取表情失败")
			return
		}
		list = append(list, gin.H{"key": key, "name": name, "preview_url": prev})
	}
	ok(c, gin.H{"stickers": list})
}

func (s *Server) getJob(c *gin.Context) {
	jobID := c.Param("id")
	raw, err := s.rdb.Get(c.Request.Context(), "job:last:"+jobID).Bytes()
	if err != nil || len(raw) == 0 {
		ok(c, gin.H{"pending": true})
		return
	}
	var m map[string]any
	if jsonErr := json.Unmarshal(raw, &m); jsonErr != nil {
		ok(c, gin.H{"pending": true})
		return
	}
	ok(c, m)
}
