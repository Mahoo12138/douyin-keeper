package webapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"huohua/internal/queue"
)

func (s *Server) archiveChat(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	if !s.requirePlanAndSession(c, a) {
		return
	}
	var extra queue.AccountJob
	if fid := strings.TrimSpace(c.Query("friend")); fid != "" {
		f, _, okF := s.loadOwnedFriend(c, currentUser(c).ID, fid)
		if !okF {
			return
		}
		if f != nil {
			extra.FriendID = f.id
		}
	}
	jobID, err := s.enqueueAccountJob(c, a, queue.TypeChatArchive, extra)
	if err != nil {
		fail(c, http.StatusServiceUnavailable, "queue", "无法同步聊天")
		return
	}
	ok(c, gin.H{"job_id": jobID})
}

func (s *Server) listMessages(c *gin.Context) {
	u := currentUser(c)
	accPID := c.Query("account")
	friendPID := c.Query("friend")
	if accPID == "" || friendPID == "" {
		fail(c, http.StatusBadRequest, "bad_request", "请选择号位和好友")
		return
	}
	a, err := s.loadOwnedAccount(c.Request.Context(), u.ID, accPID)
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "号位不存在")
		return
	}
	f, _, okF := s.loadOwnedFriend(c, u.ID, friendPID)
	if !okF {
		return
	}
	rows, err := s.db.QueryContext(c.Request.Context(), `
		SELECT direction, msg_type, body, media_url, source, observed_at, platform_msg_id
		FROM chat_messages
		WHERE user_id = ? AND account_public_id = ? AND friend_id = ?
		ORDER BY observed_at ASC, id ASC
		LIMIT 200`, u.ID, a.PublicID, f.id)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取归档失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var dir, typ, body, media, src string
		var obs time.Time
		var mid *string
		if err := rows.Scan(&dir, &typ, &body, &media, &src, &obs, &mid); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取归档失败")
			return
		}
		pid := ""
		if mid != nil {
			pid = *mid
		}
		list = append(list, gin.H{
			"direction":       dir,
			"msg_type":        typ,
			"body":            body,
			"media_url":       media,
			"source":          src,
			"observed_at":     obs.UTC().Format(time.RFC3339),
			"platform_msg_id": pid,
		})
	}
	ok(c, gin.H{"account": a.PublicID, "friend": f.publicID, "messages": list})
}

type sendReq struct {
	Body       string `json:"body"`
	StickerKey string `json:"sticker_key"`
}

func (s *Server) sendToFriend(c *gin.Context) {
	u := currentUser(c)
	f, a, okF := s.loadOwnedFriend(c, u.ID, c.Param("id"))
	if !okF {
		return
	}
	if !s.requirePlanAndSession(c, a) {
		return
	}
	var req sendReq
	if !bindJSON(c, &req) {
		return
	}
	kind := "text"
	body := strings.TrimSpace(req.Body)
	key := strings.TrimSpace(req.StickerKey)
	if key != "" {
		kind = "sticker"
		body = key
	}
	if kind == "text" && (body == "" || len([]rune(body)) > 500) {
		fail(c, http.StatusBadRequest, "bad_request", "请填写不超过 500 字的正文")
		return
	}
	if !s.allowRate(c, "rl:send:acc:"+strconv.FormatInt(a.ID, 10), 40, time.Hour) {
		return
	}
	jobID, err := s.enqueueAccountJob(c, a, queue.TypeChatSend, queue.AccountJob{
		FriendID:   f.id,
		FriendName: f.name,
		Body:       body,
		StickerKey: key,
		Kind:       kind,
	})
	if err != nil {
		fail(c, http.StatusServiceUnavailable, "queue", "无法发送")
		return
	}
	ok(c, gin.H{"job_id": jobID})
}
