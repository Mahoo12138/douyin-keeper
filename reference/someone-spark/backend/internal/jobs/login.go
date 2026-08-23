package jobs

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hibiken/asynq"

	"huohua/internal/config"
	"huohua/internal/queue"
	"huohua/internal/sidecar"
)

func (h *Handler) rejectIfSidecarUnready(ctx context.Context, jobID string) error {
	if err := sidecar.PythonReady(); err != nil {
		if sidecar.IsInstalling(err) {
			return err
		}
		h.publish(ctx, jobID, "error", map[string]any{"ok": false, "code": "sidecar", "message": sidecar.UserMessage(err)})
		return nil
	}
	return nil
}

func (h *Handler) LoginQR(ctx context.Context, t *asynq.Task) error {
	p, err := parseJob(t)
	slog.Info("login_qr 开始", "account_id", p.AccountID, "job_id", p.JobID)
	if err != nil {
		return err
	}
	if err := h.rejectIfSidecarUnready(ctx, p.JobID); err != nil {
		return err
	}
	ok, unlock := h.lockLogin(ctx, p.AccountID, p.JobID, LoginQRLockTTL)
	if !ok {
		h.publish(ctx, p.JobID, "error", map[string]any{"ok": false, "code": "busy", "message": BusyLoginMessage})
		return nil
	}
	defer unlock()
	out := h.statePath(p.JobID)
	if err := os.MkdirAll(filepath.Dir(out), 0o700); err != nil {
		h.publish(ctx, p.JobID, "error", map[string]any{"ok": false, "code": "sidecar", "message": sidecar.UserMessage(err)})
		return nil
	}
	defer os.Remove(out)
	runCtx, stop := loginSidecarCtx(LoginQRSidecarTimeout)
	defer stop()
	go h.watchLoginCancel(runCtx, stop, p.JobID)
	go h.watchLoginSMSCode(runCtx, p.JobID)
	last, err := h.driveLogin(runCtx, p, LoginQRSidecarTimeout, map[string]any{
		"op":        "login_qr_loop",
		"job_id":    p.JobID,
		"public_id": p.PublicID,
		"state_out": out,
	})
	if err != nil && sidecar.IsInstalling(err) {
		return err
	}
	return h.finishLoginState(ctx, p, last, out, "")
}

func (h *Handler) LoginSMSStart(ctx context.Context, t *asynq.Task) error {
	p, err := parseJob(t)
	if err != nil {
		return err
	}
	if err := h.rejectIfSidecarUnready(ctx, p.JobID); err != nil {
		return err
	}
	ok, unlock := h.lockLogin(ctx, p.AccountID, p.JobID, LoginSMSLockTTL)
	if !ok {
		h.publish(ctx, p.JobID, "error", map[string]any{"ok": false, "code": "busy", "message": BusyLoginMessage})
		return nil
	}
	defer unlock()
	profile := h.smsProfile(p.SMSSess)
	runCtx, stop := loginSidecarCtx(2 * time.Minute)
	defer stop()
	go h.watchLoginCancel(runCtx, stop, p.JobID)
	last, err := h.driveLogin(runCtx, p, 2*time.Minute, map[string]any{
		"op":          "login_sms_start",
		"job_id":      p.JobID,
		"public_id":   p.PublicID,
		"phone":       p.Phone,
		"sms_session": p.SMSSess,
		"profile_dir": profile,
	})
	if err != nil {
		if sidecar.IsInstalling(err) {
			return err
		}
		return nil
	}
	if last != nil && strField(last, "type") == "error" {
		return nil
	}
	return nil
}

func (h *Handler) LoginSMSVerify(ctx context.Context, t *asynq.Task) error {
	p, err := parseJob(t)
	if err != nil {
		return err
	}
	if err := h.rejectIfSidecarUnready(ctx, p.JobID); err != nil {
		return err
	}
	ok, unlock := h.lockLogin(ctx, p.AccountID, p.JobID, LoginSMSLockTTL)
	if !ok {
		h.publish(ctx, p.JobID, "error", map[string]any{"ok": false, "code": "busy", "message": BusyLoginMessage})
		return nil
	}
	defer unlock()
	out := h.statePath(p.JobID)
	if err := os.MkdirAll(filepath.Dir(out), 0o700); err != nil {
		h.publish(ctx, p.JobID, "error", map[string]any{"ok": false, "code": "sidecar", "message": sidecar.UserMessage(err)})
		return nil
	}
	defer os.Remove(out)
	profile := h.smsProfile(p.SMSSess)
	defer os.RemoveAll(profile)
	runCtx, stop := loginSidecarCtx(2 * time.Minute)
	defer stop()
	go h.watchLoginCancel(runCtx, stop, p.JobID)
	last, err := h.driveLogin(runCtx, p, 2*time.Minute, map[string]any{
		"op":          "login_sms_verify",
		"job_id":      p.JobID,
		"public_id":   p.PublicID,
		"sms_session": p.SMSSess,
		"sms_code":    p.SMSCode,
		"profile_dir": profile,
		"state_out":   out,
	})
	if err != nil && sidecar.IsInstalling(err) {
		return err
	}
	return h.finishLoginState(ctx, p, last, out, p.Phone)
}

func (h *Handler) SessionCheck(ctx context.Context, t *asynq.Task) error {
	p, err := parseJob(t)
	if err != nil {
		return err
	}
	var blob []byte
	err = h.d.DB.QueryRowContext(ctx, `
		SELECT session_blob FROM douyin_accounts
		WHERE id = ? AND user_id = ? AND slot_status = 'active'`, p.AccountID, p.UserID).Scan(&blob)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if len(blob) == 0 {
		_, _ = h.d.DB.ExecContext(ctx, `
			UPDATE douyin_accounts SET session_status = 'unbound', last_login_check_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
			WHERE id = ? AND user_id = ?`, p.AccountID, p.UserID)
		h.publish(ctx, p.JobID, "done", map[string]any{"ok": true, "session_status": "unbound"})
		return nil
	}
	stateIn, cleanup, err := h.writeStateIn(ctx, p)
	if err != nil {
		h.publish(ctx, p.JobID, "error", map[string]any{"ok": false, "code": "no_session", "message": "登录态无法解密"})
		return nil
	}
	defer cleanup()
	var last map[string]any
	err = h.runSidecar(ctx, 70*time.Second, map[string]any{
		"op":        "session_check",
		"public_id": p.PublicID,
		"state_in":  stateIn,
	}, func(m map[string]any) { last = m })
	status := "unknown"
	if err == nil && last != nil {
		if s := strField(last, "session_status"); s != "" {
			status = s
		} else if strField(last, "code") == "expired" {
			status = "expired"
		}
	}
	_, _ = h.d.DB.ExecContext(ctx, `
		UPDATE douyin_accounts SET session_status = ?, last_login_check_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
		WHERE id = ? AND user_id = ?`, status, p.AccountID, p.UserID)
	h.publish(ctx, p.JobID, "done", map[string]any{"ok": true, "session_status": status})
	return nil
}

func (h *Handler) driveLogin(ctx context.Context, p queue.AccountJob, timeout time.Duration, payload map[string]any) (map[string]any, error) {
	var last map[string]any
	err := h.runSidecar(ctx, timeout, payload, func(m map[string]any) {
		last = m
		typ := strField(m, "type")
		if typ == "" || typ == "done" {
			return
		}
		step := strField(m, "step")
		if typ == "sms_required" || step == "identity" || step == "sms_submit" || step == "sms_wait" || step == "sms_fill" || step == "challenge" || step == "sms_bad" {
			h.extendLoginWait(p)
		}
		h.publish(ctx, p.JobID, typ, m)
	})
	if err != nil {
		if sidecar.IsInstalling(err) {
			return last, err
		}
		if last != nil && strField(last, "type") == "error" {
			return last, nil
		}
		if last != nil {
			typ := strField(last, "type")
			if typ == "logged_in" || typ == "done" {
				return last, nil
			}
		}
		op := strField(payload, "op")
		pubCtx, pubStop := loginPersistCtx()
		defer pubStop()
		cancelled := errors.Is(err, context.Canceled) || LoginCancelled(pubCtx, h.d.RDB, p.JobID)
		if cancelled {
			last = map[string]any{"ok": false, "type": "error", "code": "cancelled", "message": CancelledLoginMessage}
			h.publish(pubCtx, p.JobID, "error", last)
			return last, nil
		}
		msg := sidecar.UserMessage(err)
		code := "sidecar"
		if errors.Is(err, context.DeadlineExceeded) || strings.Contains(err.Error(), "deadline") || strings.Contains(err.Error(), "signal: killed") {
			code = "timeout"
			if op == "login_qr_loop" {
				msg = "扫码超时。若已弹出身份验证，请重新获取二维码后再扫，并在网页填写短信验证码。请看 Worker 日志与 var/tmp/login-debug-*.png 定位卡点"
			}
		}
		last = map[string]any{"ok": false, "type": "error", "code": code, "message": msg}
		h.publish(pubCtx, p.JobID, "error", last)
		return last, nil
	}
	if last != nil && strField(last, "type") == "error" {
		return last, nil
	}
	return last, nil
}

func (h *Handler) watchLoginCancel(ctx context.Context, stop context.CancelFunc, jobID string) {
	if h == nil || h.d.RDB == nil || jobID == "" || stop == nil {
		return
	}
	t := time.NewTicker(400 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if LoginCancelled(ctx, h.d.RDB, jobID) {
				slog.Info("login 取消，杀掉 sidecar", "job_id", jobID)
				stop()
				return
			}
		}
	}
}

func loginPersistCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 20*time.Second)
}

func loginSidecarCtx(timeout time.Duration) (context.Context, context.CancelFunc) {
	if timeout <= 0 {
		timeout = 5*time.Minute + 30*time.Second
	}
	return context.WithTimeout(context.Background(), timeout)
}

func identityFromState(state []byte, nick, uid string) (string, string) {
	if nick != "" && uid != "" {
		return nick, uid
	}
	var m struct {
		Cookies []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"cookies"`
	}
	if json.Unmarshal(state, &m) != nil {
		return nick, uid
	}
	for _, c := range m.Cookies {
		name := c.Name
		val := strings.TrimSpace(c.Value)
		if val == "" {
			continue
		}
		if uid == "" && (name == "uid_tt" || name == "uid_tt_ss" || name == "sid_uid") {
			uid = val
		}
	}
	if len(uid) > 64 {
		uid = uid[:64]
	}
	return nick, uid
}

func stateHasSession(state []byte) bool {
	if len(state) < 8 {
		return false
	}
	var m struct {
		Cookies []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"cookies"`
	}
	if json.Unmarshal(state, &m) != nil {
		s := string(state)
		return strings.Contains(s, `"sessionid"`) || strings.Contains(s, `"sid_tt"`)
	}
	for _, c := range m.Cookies {
		name := c.Name
		if strings.TrimSpace(c.Value) == "" {
			continue
		}
		if name == "sessionid" || strings.HasPrefix(name, "sessionid") || name == "sid_tt" {
			return true
		}
	}
	return false
}

func (h *Handler) finishLoginState(ctx context.Context, p queue.AccountJob, last map[string]any, out, phone string) error {
	writeCtx, cancel := loginPersistCtx()
	defer cancel()
	defer h.clearLoginActive(p.AccountID, p.JobID)
	state, err := os.ReadFile(out)
	hasState := err == nil && stateHasSession(state)
	if !hasState {
		if last != nil && strField(last, "type") == "error" {
			return nil
		}
		if LoginCancelled(writeCtx, h.d.RDB, p.JobID) {
			return nil
		}
		h.publish(writeCtx, p.JobID, "error", map[string]any{"ok": false, "code": "no_state", "message": "扫码/短信未导出登录态"})
		return nil
	}
	nick := strField(last, "nickname")
	uid := strField(last, "douyin_uid")
	nick, uid = identityFromState(state, nick, uid)
	if err := h.saveSession(writeCtx, p, nick, uid, state, phone); err != nil {
		h.publish(writeCtx, p.JobID, "error", map[string]any{"ok": false, "code": "save_failed", "message": "写入加密会话失败"})
		return nil
	}
	h.publish(writeCtx, p.JobID, "success", map[string]any{"ok": true, "nickname": nick, "session_status": "valid"})
	return nil
}

func (h *Handler) smsProfile(sess string) string {
	if sess == "" {
		sess = "anon"
	}
	return config.JoinUnder(h.d.Cfg.Root, h.d.Cfg.TmpDir, "sms-"+sess)
}

func (h *Handler) smsCodePath(jobID string) string {
	if jobID == "" {
		jobID = "anon"
	}
	return config.JoinUnder(h.d.Cfg.Root, h.d.Cfg.TmpDir, "login-sms-"+jobID)
}

func (h *Handler) extendLoginWait(p queue.AccountJob) {
	if h == nil || h.d.RDB == nil || p.JobID == "" {
		return
	}
	ctx := context.Background()
	_ = h.d.RDB.Expire(ctx, LoginJobKey(p.JobID), LoginJobTTL).Err()
	_ = h.d.RDB.Expire(ctx, LoginActiveKey(p.AccountID), LoginJobTTL).Err()
	_ = h.d.RDB.Expire(ctx, AccountLockKey(p.AccountID), LoginQRLockTTL).Err()
}

func (h *Handler) watchLoginSMSCode(ctx context.Context, jobID string) {
	if h == nil || h.d.RDB == nil || jobID == "" {
		return
	}
	t := time.NewTicker(400 * time.Millisecond)
	defer t.Stop()
	out := h.smsCodePath(jobID)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s, err := h.d.RDB.Get(ctx, LoginCodeKey(jobID)).Result()
			if err != nil || strings.TrimSpace(s) == "" {
				continue
			}
			s = strings.TrimSpace(s)
			if err := os.MkdirAll(filepath.Dir(out), 0o700); err != nil {
				continue
			}
			if err := os.WriteFile(out, []byte(s), 0o600); err == nil {
				_ = h.d.RDB.Del(ctx, LoginCodeKey(jobID)).Err()
			}
		}
	}
}
