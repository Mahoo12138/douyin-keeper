package jobs

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"

	"huohua/internal/config"
	"huohua/internal/cryptox"
	"huohua/internal/douyin"
	"huohua/internal/queue"
	"huohua/internal/sidecar"
)

type Deps struct {
	Cfg   *config.Config
	DB    *sql.DB
	RDB   *redis.Client
	Asynq *asynq.Client
}

func NewMux(d Deps) *asynq.ServeMux {
	mux := queue.NewMux()
	h := &Handler{d: d}
	mux.HandleFunc(queue.TypeLoginQR, h.LoginQR)
	mux.HandleFunc(queue.TypeLoginSMSStart, h.LoginSMSStart)
	mux.HandleFunc(queue.TypeLoginSMSVerify, h.LoginSMSVerify)
	mux.HandleFunc(queue.TypeSessionCheck, h.SessionCheck)
	mux.HandleFunc(queue.TypeFriendsSync, h.FriendsSync)
	mux.HandleFunc(queue.TypeChatArchive, h.ChatArchive)
	mux.HandleFunc(queue.TypeChatSend, h.ChatSend)
	mux.HandleFunc(queue.TypeTaskTick, h.TaskTick)
	return mux
}

type Handler struct {
	d Deps
}

func parseJob(t *asynq.Task) (queue.AccountJob, error) {
	var p queue.AccountJob
	err := json.Unmarshal(t.Payload(), &p)
	return p, err
}

func (h *Handler) publish(ctx context.Context, jobID, typ string, extra map[string]any) {
	if extra == nil {
		extra = map[string]any{}
	}
	extra["type"] = typ
	if douyin.HasSecretKey(extra) {
		slog.Warn("login event dropped secrets", "job", jobID, "type", typ)
	}
	douyin.StripSecrets(extra)
	b, err := json.Marshal(extra)
	if err != nil {
		return
	}
	_ = h.d.RDB.Publish(ctx, LoginEvtPrefix+jobID, b).Err()
	_ = h.d.RDB.Set(ctx, LoginLastPrefix+jobID, b, LoginJobTTL).Err()
}

func (h *Handler) statePath(jobID string) string {
	return config.JoinUnder(h.d.Cfg.Root, h.d.Cfg.TmpDir, "login-"+jobID+".json")
}

func logSidecarLine(jobID string, raw []byte, m map[string]any) {
	if m == nil {
		s := string(raw)
		if len(s) > 300 {
			s = s[:300] + "…"
		}
		slog.Info("sidecar", "job_id", jobID, "raw", s)
		return
	}
	typ := strField(m, "type")
	if typ == "" {
		typ = "unknown"
	}
	attrs := []any{"job_id", jobID, "type", typ, "step", strField(m, "step"), "code", strField(m, "code")}
	if msg := strField(m, "message"); msg != "" {
		if len(msg) > 240 {
			msg = msg[:240] + "…"
		}
		attrs = append(attrs, "message", msg)
	}
	if typ == "qr" {
		img := strField(m, "image")
		attrs = append(attrs, "has_image", img != "", "image_len", len(img))
	}
	slog.Info("sidecar", attrs...)
}

func (h *Handler) runSidecar(ctx context.Context, timeout time.Duration, payload map[string]any, onEvent func(map[string]any)) error {
	if err := sidecar.PythonReady(); err != nil {
		return err
	}
	jobID := strField(payload, "job_id")
	env := append(os.Environ(),
		"HUOHUA_ADAPTER="+h.d.Cfg.Adapter,
		"PYTHONUNBUFFERED=1",
	)
	return sidecar.RunLines(ctx, sidecar.RunCfg{
		Bin:     h.d.Cfg.SidecarPy,
		Script:  h.d.Cfg.SidecarPyScript,
		Root:    h.d.Cfg.Root,
		Env:     env,
		Timeout: timeout,
		OnStart: func(pid int) {
			slog.Info("sidecar 进程", "job_id", jobID, "pid", pid)
			if jobID != "" {
				BindSidecarPID(context.Background(), h.d.RDB, jobID, pid)
			}
		},
	}, payload, func(line []byte) error {
		var m map[string]any
		if err := json.Unmarshal(line, &m); err != nil {
			logSidecarLine(jobID, line, nil)
			return nil
		}
		if douyin.HasSecretKey(m) {
			slog.Warn("sidecar line contained secrets, stripped")
		}
		douyin.StripSecrets(m)
		logSidecarLine(jobID, line, m)
		onEvent(m)
		return nil
	})
}

func (h *Handler) saveSession(ctx context.Context, p queue.AccountJob, nickname, uid string, state []byte, phone string) error {
	blob, err := cryptox.Seal(h.d.Cfg.SessionKey, state)
	if err != nil {
		return err
	}
	if phone != "" {
		cipher, err := cryptox.Seal(h.d.Cfg.SessionKey, []byte(phone))
		if err != nil {
			return err
		}
		res, err := h.d.DB.ExecContext(ctx, `
			UPDATE douyin_accounts
			SET nickname = ?, douyin_uid = ?, session_blob = ?, session_status = 'valid',
			    phone_cipher = ?, last_login_check_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
			WHERE id = ? AND user_id = ? AND slot_status = 'active'`,
			nullIfEmpty(nickname), nullIfEmpty(uid), blob, cipher, p.AccountID, p.UserID)
		if err != nil {
			return err
		}
		return rowsUpdated(res)
	}
	res, err := h.d.DB.ExecContext(ctx, `
		UPDATE douyin_accounts
		SET nickname = ?, douyin_uid = ?, session_blob = ?, session_status = 'valid',
		    last_login_check_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
		WHERE id = ? AND user_id = ? AND slot_status = 'active'`,
		nullIfEmpty(nickname), nullIfEmpty(uid), blob, p.AccountID, p.UserID)
	if err != nil {
		return err
	}
	return rowsUpdated(res)
}

func rowsUpdated(res sql.Result) error {
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("session row not updated")
	}
	return nil
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func strField(m map[string]any, k string) string {
	v, ok := m[k]
	if !ok || v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		return fmt.Sprint(t)
	}
}
