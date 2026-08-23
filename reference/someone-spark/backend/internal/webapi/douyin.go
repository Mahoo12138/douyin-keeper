package webapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"huohua/internal/config"
	"huohua/internal/cryptox"
	"huohua/internal/douyin"
	"huohua/internal/id"
	"huohua/internal/jobs"
	"huohua/internal/queue"
	"huohua/internal/sidecar"
)

type dyAccount struct {
	ID                int64
	PublicID          string
	Nickname          sql.NullString
	DouyinUID         sql.NullString
	SessionStatus     string
	HasSession        bool
	HasPhone          bool
	PhoneCipher       []byte
	PreferProtocol    bool
	AllowFirstMessage bool
	RiskStatus        string
	SlotStatus        string
	LastSyncAt        sql.NullTime
	LastLoginCheckAt  sql.NullTime
}

func (a dyAccount) dto() gin.H {
	phone := ""
	if len(a.PhoneCipher) > 0 {
		phone = "***********"
	}
	return gin.H{
		"public_id":           a.PublicID,
		"nickname":            nullStr(a.Nickname),
		"douyin_uid":          nullStr(a.DouyinUID),
		"session_status":      a.SessionStatus,
		"phone_masked":        phone,
		"has_session":         a.HasSession,
		"prefer_protocol":     a.PreferProtocol,
		"allow_first_message": a.AllowFirstMessage,
		"risk_status":         a.RiskStatus,
		"slot_status":         a.SlotStatus,
		"last_sync_at":        nullTime(a.LastSyncAt),
		"last_login_check_at": nullTime(a.LastLoginCheckAt),
	}
}

func nullStr(v sql.NullString) any {
	if !v.Valid {
		return nil
	}
	return v.String
}

func nullTime(v sql.NullTime) any {
	if !v.Valid {
		return nil
	}
	return v.Time.UTC().Format(time.RFC3339)
}

func (s *Server) loadOwnedAccount(ctx context.Context, userID int64, publicID string) (*dyAccount, error) {
	var a dyAccount
	err := s.db.QueryRowContext(ctx, `
		SELECT id, public_id, nickname, douyin_uid, session_status,
		       session_blob IS NOT NULL, phone_cipher IS NOT NULL, phone_cipher,
		       prefer_protocol, allow_first_message, risk_status, slot_status,
		       last_sync_at, last_login_check_at
		FROM douyin_accounts
		WHERE user_id = ? AND public_id = ? AND slot_status = 'active'`, userID, publicID).Scan(
		&a.ID, &a.PublicID, &a.Nickname, &a.DouyinUID, &a.SessionStatus,
		&a.HasSession, &a.HasPhone, &a.PhoneCipher,
		&a.PreferProtocol, &a.AllowFirstMessage, &a.RiskStatus, &a.SlotStatus,
		&a.LastSyncAt, &a.LastLoginCheckAt,
	)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *Server) maskPhone(cipher []byte) string {
	if len(cipher) == 0 {
		return ""
	}
	pt, err := cryptox.Open(s.cfg.SessionKey, cipher)
	if err != nil {
		return "***"
	}
	return douyin.MaskPhone(string(pt))
}

func (s *Server) requireOwnedAccount(c *gin.Context) (*dyAccount, bool) {
	u := currentUser(c)
	publicID := c.Param("id")
	if publicID == "" {
		fail(c, http.StatusBadRequest, "bad_request", "缺少号位")
		return nil, false
	}
	a, err := s.loadOwnedAccount(c.Request.Context(), u.ID, publicID)
	if err == sql.ErrNoRows {
		fail(c, http.StatusNotFound, "not_found", "号位不存在")
		return nil, false
	}
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取号位失败")
		return nil, false
	}
	return a, true
}

func (s *Server) planValid(c *gin.Context) (bool, error) {
	u := currentUser(c)
	ent, err := s.loadEntitlement(c.Request.Context(), u.ID)
	if err != nil {
		return false, err
	}
	v, _ := ent["valid"].(bool)
	return v, nil
}

func (s *Server) listDouyin(c *gin.Context) {
	u := currentUser(c)
	rows, err := s.db.QueryContext(c.Request.Context(), `
		SELECT id, public_id, nickname, douyin_uid, session_status,
		       session_blob IS NOT NULL, phone_cipher IS NOT NULL,
		       prefer_protocol, allow_first_message, risk_status, slot_status,
		       last_sync_at, last_login_check_at
		FROM douyin_accounts
		WHERE user_id = ? AND slot_status = 'active'
		ORDER BY id ASC`, u.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取号位失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var a dyAccount
		if err := rows.Scan(
			&a.ID, &a.PublicID, &a.Nickname, &a.DouyinUID, &a.SessionStatus,
			&a.HasSession, &a.HasPhone,
			&a.PreferProtocol, &a.AllowFirstMessage, &a.RiskStatus, &a.SlotStatus,
			&a.LastSyncAt, &a.LastLoginCheckAt,
		); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取号位失败")
			return
		}
		item := a.dto()
		if a.HasPhone {
			item["phone_masked"] = "***"
		}
		list = append(list, item)
	}
	ok(c, gin.H{"accounts": list})
}

func (s *Server) getDouyin(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	c.Header("Cache-Control", "no-store")
	item := a.dto()
	item["phone_masked"] = s.maskPhone(a.PhoneCipher)
	item["login_pending"] = s.loginJobPending(c.Request.Context(), a.ID)
	ok(c, item)
}

func (s *Server) loginJobPending(ctx context.Context, accountID int64) bool {
	if s == nil || s.rdb == nil {
		return false
	}
	n, err := s.rdb.Exists(ctx, jobs.LoginActiveKey(accountID)).Result()
	return err == nil && n > 0
}

type patchDyReq struct {
	PreferProtocol    *bool `json:"prefer_protocol"`
	AllowFirstMessage *bool `json:"allow_first_message"`
}

func (s *Server) patchDouyin(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	var req patchDyReq
	if !bindJSON(c, &req) {
		return
	}
	pref := a.PreferProtocol
	first := a.AllowFirstMessage
	if req.PreferProtocol != nil {
		pref = *req.PreferProtocol
	}
	if req.AllowFirstMessage != nil {
		first = *req.AllowFirstMessage
	}
	if _, err := s.db.ExecContext(c.Request.Context(), `
		UPDATE douyin_accounts SET prefer_protocol = ?, allow_first_message = ?, updated_at = UTC_TIMESTAMP()
		WHERE id = ? AND user_id = ?`, pref, first, a.ID, currentUser(c).ID); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "保存失败")
		return
	}
	a.PreferProtocol = pref
	a.AllowFirstMessage = first
	item := a.dto()
	item["phone_masked"] = s.maskPhone(a.PhoneCipher)
	ok(c, item)
}

func (s *Server) unbindDouyin(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	u := currentUser(c)
	if _, err := s.db.ExecContext(c.Request.Context(), `
		UPDATE douyin_accounts
		SET session_blob = NULL, phone_cipher = NULL, douyin_uid = NULL, nickname = NULL, avatar_url = NULL,
		    session_status = 'unbound', risk_status = '', risk_reason = '', updated_at = UTC_TIMESTAMP()
		WHERE id = ? AND user_id = ?`, a.ID, u.ID); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "解绑失败")
		return
	}
	s.audit(c.Request.Context(), &u.ID, "douyin.unbind", clientIP(c), gin.H{"public_id": a.PublicID})
	s.bustUserDash(u.ID)
	ok(c, gin.H{"unbound": true, "public_id": a.PublicID})
}

func (s *Server) checkSession(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	jobID, err := s.enqueueAccountJob(c, a, queue.TypeSessionCheck, queue.AccountJob{})
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "入队失败")
		return
	}
	ok(c, gin.H{"job_id": jobID})
}

func sidecarQRError(st sidecar.Status) (code, msg string, blocked bool) {
	if st.Ready() {
		return "", "", false
	}
	if st.State == sidecar.StateError && strings.TrimSpace(st.Message) != "" {
		return "sidecar", st.Message, true
	}
	if st.State == "" {
		return "browser_installing", "扫码需由 Worker 处理。请确认 huohua-worker 已启动；若正在安装浏览器，请稍后重试", true
	}
	return "browser_installing", sidecar.ErrPythonInstalling.Error(), true
}

func (s *Server) requireSidecarReady(c *gin.Context) bool {
	code, msg, blocked := sidecarQRError(sidecar.ReadReportedStatus(c.Request.Context(), s.rdb))
	if !blocked {
		return true
	}
	fail(c, http.StatusServiceUnavailable, code, msg)
	return false
}

func (s *Server) startQR(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	if !s.requireSidecarReady(c) {
		return
	}
	if !s.allowRateNamed(c, "rl:qr:acc:"+strconv.FormatInt(a.ID, 10), 8, time.Minute, "login_rate_limited", "本平台扫码请求过于频繁，请 %d 秒后再试（每号每分钟 8 次，到期自动解除）") {
		return
	}
	if !s.allowRateNamed(c, "rl:qr:ip:"+clientIP(c), 20, time.Minute, "login_rate_limited", "本平台扫码请求过于频繁，请 %d 秒后再试（每 IP 每分钟 20 次，到期自动解除）") {
		return
	}
	if !s.admitLogin(c, a.ID) {
		return
	}
	jobID, err := s.enqueueAccountJob(c, a, queue.TypeLoginQR, queue.AccountJob{})
	if err != nil {
		fail(c, http.StatusServiceUnavailable, "queue", "无法开始扫码")
		return
	}
	ok(c, gin.H{"job_id": jobID})
}

type smsStartReq struct {
	Phone string `json:"phone"`
}

func (s *Server) startSMS(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	if !s.requireSidecarReady(c) {
		return
	}
	var req smsStartReq
	if !bindJSON(c, &req) {
		return
	}
	phone := douyin.NormalizePhone(req.Phone)
	if !douyin.ValidCNMobile(phone) {
		fail(c, http.StatusBadRequest, "bad_phone", "手机号格式不正确")
		return
	}
	if !s.allowRateNamed(c, "rl:sms:acc:"+strconv.FormatInt(a.ID, 10), 8, time.Minute, "login_rate_limited", "本平台短信登录请求过于频繁，请 %d 秒后再试（每号每分钟 8 次，到期自动解除）") {
		return
	}
	if !s.allowRateNamed(c, "rl:sms:ip:"+clientIP(c), 20, time.Minute, "login_rate_limited", "本平台短信登录请求过于频繁，请 %d 秒后再试（每 IP 每分钟 20 次，到期自动解除）") {
		return
	}
	if !s.admitLogin(c, a.ID) {
		return
	}
	jobID, err := s.enqueueAccountJob(c, a, queue.TypeLoginSMSStart, queue.AccountJob{Phone: phone, SMSSess: ""})
	if err != nil {
		fail(c, http.StatusServiceUnavailable, "queue", "无法开始短信登录")
		return
	}
	meta, _ := json.Marshal(gin.H{"user_id": currentUser(c).ID, "account_id": a.ID, "public_id": a.PublicID, "phone": phone})
	_ = s.rdb.Set(c.Request.Context(), "login:sms:"+jobID, meta, 5*time.Minute).Err()
	ok(c, gin.H{"job_id": jobID, "sms_session": jobID})
}

type smsVerifyReq struct {
	SMSSession string `json:"sms_session"`
	Code       string `json:"code"`
}

func (s *Server) verifySMS(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	var req smsVerifyReq
	if !bindJSON(c, &req) {
		return
	}
	code := douyin.NormalizePhone(req.Code)
	if len(code) != 6 {
		fail(c, http.StatusBadRequest, "bad_code", "验证码为 6 位数字")
		return
	}
	if !s.allowRate(c, "rl:smsv:acc:"+strconv.FormatInt(a.ID, 10), 8, 10*time.Minute) {
		return
	}
	if !s.allowRate(c, "rl:smsv:ip:"+clientIP(c), 16, 10*time.Minute) {
		return
	}
	sess := req.SMSSession
	if sess == "" {
		fail(c, http.StatusBadRequest, "bad_request", "缺少短信会话")
		return
	}
	raw, err := s.rdb.Get(c.Request.Context(), "login:sms:"+sess).Bytes()
	if err != nil {
		fail(c, http.StatusGone, "sms_expired", "短信登录已过期，请重新获取")
		return
	}
	var meta map[string]any
	if err := json.Unmarshal(raw, &meta); err != nil {
		fail(c, http.StatusGone, "sms_expired", "短信登录已过期，请重新获取")
		return
	}
	if fmt.Sprint(meta["account_id"]) != strconv.FormatInt(a.ID, 10) && toInt64(meta["account_id"]) != a.ID {
		fail(c, http.StatusForbidden, "forbidden", "短信会话不属于该号")
		return
	}
	phone, _ := meta["phone"].(string)
	if !s.admitLogin(c, a.ID) {
		return
	}
	jobID, err := s.enqueueAccountJob(c, a, queue.TypeLoginSMSVerify, queue.AccountJob{
		Phone:   phone,
		SMSSess: sess,
		SMSCode: code,
	})
	if err != nil {
		fail(c, http.StatusServiceUnavailable, "queue", "无法校验验证码")
		return
	}
	ok(c, gin.H{"job_id": jobID})
}

type qrSmsReq struct {
	JobID string `json:"job_id"`
	Code  string `json:"code"`
}

func (s *Server) submitQRSms(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	var req qrSmsReq
	if !bindJSON(c, &req) {
		return
	}
	code := douyin.NormalizePhone(req.Code)
	if len(code) != 6 {
		fail(c, http.StatusBadRequest, "bad_code", "验证码为 6 位数字")
		return
	}
	jobID := strings.TrimSpace(req.JobID)
	if jobID == "" {
		fail(c, http.StatusBadRequest, "bad_request", "缺少 job")
		return
	}
	raw, err := s.rdb.Get(c.Request.Context(), jobs.LoginJobKey(jobID)).Bytes()
	if err != nil {
		fail(c, http.StatusGone, "sms_expired", "登录作业已过期，请重新获取二维码")
		return
	}
	var meta map[string]any
	if err := json.Unmarshal(raw, &meta); err != nil {
		fail(c, http.StatusGone, "sms_expired", "登录作业已过期，请重新获取二维码")
		return
	}
	if toInt64(meta["account_id"]) != a.ID || toInt64(meta["user_id"]) != currentUser(c).ID {
		fail(c, http.StatusForbidden, "forbidden", "作业不属于该号")
		return
	}
	if !s.allowRate(c, "rl:qrsms:acc:"+strconv.FormatInt(a.ID, 10), 8, 10*time.Minute) {
		return
	}
	if err := s.rdb.Set(c.Request.Context(), jobs.LoginCodeKey(jobID), code, 3*time.Minute).Err(); err != nil {
		fail(c, http.StatusServiceUnavailable, "queue", "无法提交验证码")
		return
	}
	path := config.JoinUnder(s.cfg.Root, s.cfg.TmpDir, "login-sms-"+jobID)
	_ = os.MkdirAll(filepath.Dir(path), 0o700)
	_ = os.WriteFile(path, []byte(code), 0o600)
	_ = s.rdb.Expire(c.Request.Context(), jobs.LoginJobKey(jobID), jobs.LoginJobTTL).Err()
	ok(c, gin.H{"ok": true, "job_id": jobID})
}

func toInt64(v any) int64 {
	switch t := v.(type) {
	case float64:
		return int64(t)
	case json.Number:
		n, _ := t.Int64()
		return n
	case int64:
		return t
	case int:
		return int64(t)
	default:
		n, _ := strconv.ParseInt(fmt.Sprint(v), 10, 64)
		return n
	}
}

func (s *Server) enqueueAccountJob(c *gin.Context, a *dyAccount, typ string, extra queue.AccountJob) (string, error) {
	u := currentUser(c)
	jobID := id.New()
	p := extra
	p.JobID = jobID
	p.UserID = u.ID
	p.AccountID = a.ID
	p.PublicID = a.PublicID
	if p.SMSSess == "" && (typ == queue.TypeLoginSMSStart) {
		p.SMSSess = jobID
	}
	meta, _ := json.Marshal(gin.H{"user_id": u.ID, "account_id": a.ID, "public_id": a.PublicID})
	if err := s.rdb.Set(c.Request.Context(), jobs.LoginJobKey(jobID), meta, jobs.LoginJobTTL).Err(); err != nil {
		return "", err
	}
	if typ == queue.TypeLoginQR || typ == queue.TypeLoginSMSStart || typ == queue.TypeLoginSMSVerify {
		_ = s.rdb.Set(c.Request.Context(), jobs.LoginActiveKey(a.ID), jobID, jobs.LoginJobTTL).Err()
	}
	var err error
	switch typ {
	case queue.TypeLoginQR:
		err = queue.EnqueueLoginQR(c.Request.Context(), s.asynq, p)
	case queue.TypeLoginSMSStart:
		err = queue.EnqueueSMSStart(c.Request.Context(), s.asynq, p)
	case queue.TypeLoginSMSVerify:
		err = queue.EnqueueSMSVerify(c.Request.Context(), s.asynq, p)
	case queue.TypeSessionCheck:
		err = queue.EnqueueSessionCheck(c.Request.Context(), s.asynq, p)
	case queue.TypeFriendsSync:
		err = queue.EnqueueFriendsSync(c.Request.Context(), s.asynq, p)
	case queue.TypeChatArchive:
		err = queue.EnqueueChatArchive(c.Request.Context(), s.asynq, p)
	case queue.TypeChatSend:
		err = queue.EnqueueChatSend(c.Request.Context(), s.asynq, p)
	default:
		err = fmt.Errorf("unknown job")
	}
	return jobID, err
}

func (s *Server) loginEvents(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	jobID := c.Query("job")
	if jobID == "" {
		fail(c, http.StatusBadRequest, "bad_request", "缺少 job")
		return
	}
	raw, err := s.rdb.Get(c.Request.Context(), jobs.LoginJobKey(jobID)).Bytes()
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "登录作业不存在或已过期")
		return
	}
	var meta map[string]any
	_ = json.Unmarshal(raw, &meta)
	if toInt64(meta["account_id"]) != a.ID || toInt64(meta["user_id"]) != currentUser(c).ID {
		fail(c, http.StatusForbidden, "forbidden", "作业不属于该号")
		return
	}
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	flusher, canFlush := c.Writer.(http.Flusher)
	writeEvt := func(b []byte) {
		var m map[string]any
		if json.Unmarshal(b, &m) == nil {
			douyin.StripSecrets(m)
			b, _ = json.Marshal(m)
		}
		_, _ = fmt.Fprintf(c.Writer, "data: %s\n\n", b)
		if canFlush {
			flusher.Flush()
		}
	}
	if last, err := s.rdb.Get(c.Request.Context(), jobs.LoginLastPrefix+jobID).Bytes(); err == nil && len(last) > 0 {
		writeEvt(last)
	}
	subRDB := redis.NewClient(&redis.Options{
		Addr:     s.cfg.RedisAddr,
		Password: s.cfg.RedisPassword,
		DB:       s.cfg.RedisDB,
	})
	defer subRDB.Close()
	ctx := c.Request.Context()
	sub := subRDB.Subscribe(ctx, jobs.LoginEvtPrefix+jobID)
	defer sub.Close()
	ch := sub.Channel()
	tick := time.NewTicker(15 * time.Second)
	defer tick.Stop()
	deadline := time.After(600 * time.Second)
	for {
		select {
		case <-ctx.Done():
			return
		case <-deadline:
			_, _ = fmt.Fprintf(c.Writer, "event: timeout\ndata: {\"type\":\"timeout\"}\n\n")
			if canFlush {
				flusher.Flush()
			}
			return
		case <-tick.C:
			_, _ = fmt.Fprintf(c.Writer, ": ping\n\n")
			if canFlush {
				flusher.Flush()
			}
		case msg, open := <-ch:
			if !open {
				return
			}
			writeEvt([]byte(msg.Payload))
		}
	}
}

func (s *Server) admitLogin(c *gin.Context, accountID int64) bool {
	if jobs.AdmitLogin(c.Request.Context(), s.rdb, accountID) {
		return true
	}
	fail(c, http.StatusConflict, "busy", jobs.BusyLoginMessage)
	return false
}

func (s *Server) cancelLogin(c *gin.Context) {
	a, okAcc := s.requireOwnedAccount(c)
	if !okAcc {
		return
	}
	ctx := c.Request.Context()
	jobID, _ := s.rdb.Get(ctx, jobs.LoginActiveKey(a.ID)).Result()
	pid, err := jobs.CancelLogin(ctx, s.rdb, a.ID, jobID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "无法取消当前作业")
		return
	}
	if pid > 0 {
		sidecar.KillTree(pid)
	}
	if jobID != "" {
		payload := map[string]any{"ok": false, "code": "cancelled", "message": jobs.CancelledLoginMessage, "type": "error"}
		douyin.StripSecrets(payload)
		b, err := json.Marshal(payload)
		if err == nil {
			_ = s.rdb.Publish(ctx, jobs.LoginEvtPrefix+jobID, b).Err()
			_ = s.rdb.Set(ctx, jobs.LoginLastPrefix+jobID, b, jobs.LoginJobTTL).Err()
		}
	}
	ok(c, gin.H{"cleared": true, "killed": pid > 0})
}
