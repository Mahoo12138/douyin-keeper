package jobs

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"huohua/internal/archive"
	"huohua/internal/cryptox"
	"huohua/internal/douyin"
	"huohua/internal/queue"
	"huohua/internal/sidecar"
)

func (h *Handler) jobResult(ctx context.Context, jobID string, extra map[string]any) {
	if extra == nil {
		extra = map[string]any{}
	}
	douyin.StripSecrets(extra)
	b, err := json.Marshal(extra)
	if err != nil {
		return
	}
	_ = h.d.RDB.Set(ctx, "job:last:"+jobID, b, 10*time.Minute).Err()
}

func (h *Handler) writeStateIn(ctx context.Context, p queue.AccountJob) (string, func(), error) {
	var blob []byte
	err := h.d.DB.QueryRowContext(ctx, `
		SELECT session_blob FROM douyin_accounts
		WHERE id = ? AND user_id = ? AND slot_status = 'active'`, p.AccountID, p.UserID).Scan(&blob)
	if err != nil {
		return "", func() {}, err
	}
	if len(blob) == 0 {
		return "", func() {}, sql.ErrNoRows
	}
	pt, err := cryptox.Open(h.d.Cfg.SessionKey, blob)
	if err != nil {
		return "", func() {}, err
	}
	path := h.statePath("in-" + p.JobID)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", func() {}, err
	}
	if err := os.WriteFile(path, pt, 0o600); err != nil {
		return "", func() {}, err
	}
	return path, func() { _ = os.Remove(path) }, nil
}

func (h *Handler) runNode(ctx context.Context, timeout time.Duration, payload map[string]any) (map[string]any, error) {
	env := append(os.Environ(), "HUOHUA_ADAPTER="+h.d.Cfg.Adapter)
	m, err := sidecar.RunJSON(ctx, sidecar.RunCfg{
		Bin:     h.d.Cfg.SidecarNode,
		Script:  h.d.Cfg.SidecarNodeScript,
		Root:    h.d.Cfg.Root,
		Env:     env,
		Timeout: timeout,
	}, payload)
	if m != nil {
		douyin.StripSecrets(m)
	}
	return m, err
}

func (h *Handler) siteSetting(ctx context.Context, k, def string) string {
	var v string
	if err := h.d.DB.QueryRowContext(ctx, `SELECT v FROM site_settings WHERE k = ?`, k).Scan(&v); err != nil {
		return def
	}
	if v == "" {
		return def
	}
	return v
}

func (h *Handler) siteSettingInt(ctx context.Context, k string, def int) int {
	n, err := strconv.Atoi(h.siteSetting(ctx, k, ""))
	if err != nil {
		return def
	}
	return n
}

func (h *Handler) insertArchive(ctx context.Context, userID, accountID int64, accountPID string, friendID int64, friendName, direction, msgType, body, platformID, mediaURL, source string, observed time.Time) error {
	if observed.IsZero() {
		observed = time.Now().UTC()
	}
	dir := archive.NormalizeDir(direction)
	typ := archive.NormalizeType(msgType)
	hash := archive.BodyHash(body)
	bucket := archive.TimeBucket(observed)
	var pid any
	if platformID != "" {
		pid = platformID
	}
	var fid any
	if friendID > 0 {
		fid = friendID
	}
	key := ""
	if mediaURL != "" {
		if k, err := snapshotMedia(h.d.Cfg.MediaDir, h.d.Cfg.Root, mediaURL); err == nil {
			key = k
			_, _ = h.d.DB.ExecContext(ctx, `
				INSERT IGNORE INTO media_objects (object_key, sha256, content_type, byte_size, source_url, created_at)
				VALUES (?, '', '', 0, ?, UTC_TIMESTAMP())`, k, mediaURL)
		}
	}
	_, err := h.d.DB.ExecContext(ctx, `
		INSERT IGNORE INTO chat_messages
		  (user_id, account_id, account_public_id, friend_id, friend_display_name, direction, msg_type, body, body_hash,
		   platform_msg_id, time_bucket, media_url, media_object_key, source, observed_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
		userID, accountID, accountPID, fid, friendName, dir, typ, body, hash,
		pid, bucket, mediaURL, key, source, observed.UTC())
	return err
}

func asSlice(v any) []any {
	if v == nil {
		return nil
	}
	if s, ok := v.([]any); ok {
		return s
	}
	return nil
}

func asMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func boolField(m map[string]any, k string) bool {
	switch v := m[k].(type) {
	case bool:
		return v
	case float64:
		return v != 0
	case string:
		return v == "1" || v == "true"
	default:
		return false
	}
}

func (h *Handler) sidecarLast(ctx context.Context, timeout time.Duration, payload map[string]any) (map[string]any, string) {
	var last map[string]any
	err := h.runSidecar(ctx, timeout, payload, func(m map[string]any) { last = m })
	if err != nil {
		return last, "sidecar"
	}
	if last == nil {
		return map[string]any{"ok": false}, "sidecar"
	}
	if strField(last, "type") == "error" || !boolField(last, "ok") {
		code := strField(last, "code")
		if code == "" {
			code = "sidecar"
		}
		return last, code
	}
	return last, ""
}

func (h *Handler) maybeExpire(ctx context.Context, p queue.AccountJob, code string) {
	if code != "expired" {
		return
	}
	_, _ = h.d.DB.ExecContext(ctx, `
		UPDATE douyin_accounts SET session_status = 'expired', last_login_check_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
		WHERE id = ? AND user_id = ?`, p.AccountID, p.UserID)
}

func intField(m map[string]any, k string) int {
	switch v := m[k].(type) {
	case float64:
		return int(v)
	case int:
		return v
	case json.Number:
		n, _ := v.Int64()
		return int(n)
	case string:
		n, _ := strconv.Atoi(v)
		return n
	default:
		return 0
	}
}
