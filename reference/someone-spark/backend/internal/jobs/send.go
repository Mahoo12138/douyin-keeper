package jobs

import (
	"context"
	"database/sql"
	"time"

	"github.com/hibiken/asynq"

	"huohua/internal/billing"
	"huohua/internal/channel"
	"huohua/internal/clock"
	"huohua/internal/id"
	"huohua/internal/queue"
)

func (h *Handler) ChatSend(ctx context.Context, t *asynq.Task) error {
	p, err := parseJob(t)
	if err != nil {
		return err
	}
	ok, unlock := h.lock(ctx, p.AccountID)
	if !ok {
		h.finishSend(ctx, p, "fail", "", "busy", "")
		return nil
	}
	defer unlock()
	if !h.userPlanValid(ctx, p.UserID) {
		h.finishSend(ctx, p, "fail", "", "plan_required", "")
		return nil
	}
	if h.accountPaused(ctx, p.AccountID) {
		h.finishSend(ctx, p, "fail", "", "risk_paused", "")
		return nil
	}
	var prefer, allowFirst bool
	var status string
	err = h.d.DB.QueryRowContext(ctx, `
		SELECT prefer_protocol, allow_first_message, session_status
		FROM douyin_accounts WHERE id = ? AND user_id = ? AND slot_status = 'active'`,
		p.AccountID, p.UserID).Scan(&prefer, &allowFirst, &status)
	if err != nil || status != "valid" {
		h.finishSend(ctx, p, "fail", "", "no_session", "")
		return nil
	}
	var friendName string
	var hasConv, sparkOn bool
	var allowFr sql.NullBool
	err = h.d.DB.QueryRowContext(ctx, `
		SELECT display_name, has_conversation, spark_enabled, allow_first_message
		FROM friends WHERE id = ? AND account_id = ?`, p.FriendID, p.AccountID).Scan(&friendName, &hasConv, &sparkOn, &allowFr)
	if err != nil {
		h.finishSend(ctx, p, "fail", "", "not_found", "")
		return nil
	}
	if !sparkOn {
		h.finishSend(ctx, p, "fail", "", "friend_disabled", "")
		return nil
	}
	kind := p.Kind
	if kind == "" {
		kind = "text"
	}
	if kind == "sticker" && p.StickerKey != "" {
		var n int
		_ = h.d.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM stickers_cache WHERE account_id = ? AND sticker_key = ?`, p.AccountID, p.StickerKey).Scan(&n)
		if n == 0 {
			h.finishSend(ctx, p, "fail", "", "sticker_denied", "")
			return nil
		}
		p.Body = "[sticker:" + p.StickerKey + "]"
	}
	siteProto := h.siteSetting(ctx, "send.protocol_enabled", "1") != "0"
	var friendAllow *bool
	if allowFr.Valid {
		v := allowFr.Bool
		friendAllow = &v
	}
	d := channel.Decide(channel.Input{
		HasConversation:   hasConv,
		AllowFirstAccount: allowFirst,
		AllowFirstFriend:  friendAllow,
		PreferProtocol:    prefer,
		SiteProtocol:      siteProto,
		Kind:              kind,
	})
	if d.Code != "" {
		h.finishSend(ctx, p, "fail", "", d.Code, "")
		return nil
	}
	day := clock.LocalDate(time.Now().UTC())
	if !p.DryRun {
		var exists int
		_ = h.d.DB.QueryRowContext(ctx, `SELECT 1 FROM send_uniques WHERE account_id = ? AND friend_id = ? AND local_date = ?`, p.AccountID, p.FriendID, day).Scan(&exists)
		if exists == 1 {
			h.finishSend(ctx, p, "fail", "", "already_sent", "")
			return nil
		}
	}
	siteLim := h.siteSettingInt(ctx, "send.daily_limit", 20)
	hard := h.siteSettingInt(ctx, "send.hard_daily_cap", 20)
	var planLim sql.NullInt64
	_ = h.d.DB.QueryRowContext(ctx, `
		SELECT p.daily_send_limit FROM subscriptions s
		JOIN plans p ON p.id = s.plan_id
		WHERE s.user_id = ? AND s.status = 'active' AND s.ends_at > UTC_TIMESTAMP()
		ORDER BY s.ends_at DESC LIMIT 1`, p.UserID).Scan(&planLim)
	cap := billing.DailyCap(siteLim, hard, int(planLim.Int64))
	var sent int
	_ = h.d.DB.QueryRowContext(ctx, `SELECT sent_count FROM daily_send_counters WHERE account_id = ? AND local_date = ?`, p.AccountID, day).Scan(&sent)
	if sent >= cap {
		h.finishSend(ctx, p, "fail", d.Channel, "rate_limited", "")
		return nil
	}
	if d.Channel == channel.CreatorFirst {
		lim := h.siteSettingInt(ctx, "send.first_message_daily_limit", 5)
		var firstN int
		_ = h.d.DB.QueryRowContext(ctx, `SELECT sent_count FROM daily_first_message_counters WHERE account_id = ? AND local_date = ?`, p.AccountID, day).Scan(&firstN)
		if firstN >= lim {
			h.finishSend(ctx, p, "fail", d.Channel, "first_message_denied", "")
			return nil
		}
	}
	stateIn, cleanup, err := h.writeStateIn(ctx, p)
	if err != nil {
		h.finishSend(ctx, p, "fail", d.Channel, "no_session", "")
		return nil
	}
	defer cleanup()
	used := d.Channel
	res, code := h.execSend(ctx, p, friendName, used, stateIn)
	if used == channel.Protocol && !channel.Confirmed(res) && code != "rate_limited" {
		used = channel.Browser
		res, code = h.execSend(ctx, p, friendName, used, stateIn)
	}
	if !channel.Confirmed(res) {
		if code == "" {
			code = "send_failed"
		}
		if code == "rate_limited" {
			h.pauseAccount(ctx, p.AccountID, "rate_limited", "限流词熔断")
		} else if code != "plan_required" && code != "already_sent" && code != "sticker_denied" {
			h.bumpFail(ctx, p.AccountID)
		}
		if code == "expired" {
			h.maybeExpire(ctx, p, code)
		}
		h.finishSend(ctx, p, "fail", used, code, "")
		return nil
	}
	mid := strField(res, "platform_msg_id")
	if !p.DryRun {
		_, _ = h.d.DB.ExecContext(ctx, `
			INSERT IGNORE INTO send_uniques (account_id, friend_id, local_date, created_at)
			VALUES (?, ?, ?, UTC_TIMESTAMP())`, p.AccountID, p.FriendID, day)
		_, _ = h.d.DB.ExecContext(ctx, `
			INSERT INTO daily_send_counters (account_id, local_date, sent_count)
			VALUES (?, ?, 1)
			ON DUPLICATE KEY UPDATE sent_count = sent_count + 1`, p.AccountID, day)
		if used == channel.CreatorFirst {
			_, _ = h.d.DB.ExecContext(ctx, `
				INSERT INTO daily_first_message_counters (account_id, local_date, sent_count)
				VALUES (?, ?, 1)
				ON DUPLICATE KEY UPDATE sent_count = sent_count + 1`, p.AccountID, day)
		}
		_, _ = h.d.DB.ExecContext(ctx, `
			UPDATE friends SET last_sent_at = UTC_TIMESTAMP(), has_conversation = 1, updated_at = UTC_TIMESTAMP()
			WHERE id = ? AND account_id = ?`, p.FriendID, p.AccountID)
		_ = h.insertArchive(ctx, p.UserID, p.AccountID, p.PublicID, p.FriendID, friendName, "out", defaultKind(p.Kind), p.Body, mid, "", used, time.Now().UTC())
		h.clearRisk(ctx, p.AccountID)
		h.bustDash(ctx, p.UserID)
	}
	h.finishSend(ctx, p, "ok", used, "", mid)
	return nil
}

func (h *Handler) execSend(ctx context.Context, p queue.AccountJob, friendName, ch, stateIn string) (map[string]any, string) {
	switch ch {
	case channel.Protocol:
		m, err := h.runNode(ctx, 40*time.Second, map[string]any{
			"op":                  "protocol_send_text",
			"public_id":           p.PublicID,
			"friend_display_name": friendName,
			"body":                p.Body,
			"state_in":            stateIn,
			"dry_run":             p.DryRun,
		})
		if err != nil {
			return map[string]any{"ok": false, "code": "protocol_unavailable"}, "protocol_unavailable"
		}
		if !channel.Confirmed(m) {
			if c := strField(m, "error"); c != "" {
				return m, c
			}
			return m, "protocol_unavailable"
		}
		return m, ""
	case channel.CreatorFirst:
		var last map[string]any
		err := h.runSidecar(ctx, 70*time.Second, map[string]any{
			"op":                  "send_first_message_creator",
			"public_id":           p.PublicID,
			"friend_display_name": friendName,
			"body":                p.Body,
			"state_in":            stateIn,
			"dry_run":             p.DryRun,
		}, func(m map[string]any) { last = m })
		if err != nil {
			return map[string]any{"ok": false}, "sidecar"
		}
		return last, strField(last, "code")
	default:
		op := "send_text"
		payload := map[string]any{
			"op":                  op,
			"public_id":           p.PublicID,
			"friend_display_name": friendName,
			"body":                p.Body,
			"state_in":            stateIn,
			"dry_run":             p.DryRun,
		}
		if p.Kind == "sticker" {
			payload["op"] = "send_sticker"
			payload["sticker_key"] = p.StickerKey
		}
		var last map[string]any
		err := h.runSidecar(ctx, 70*time.Second, payload, func(m map[string]any) { last = m })
		if err != nil {
			return map[string]any{"ok": false}, "sidecar"
		}
		return last, strField(last, "code")
	}
}

func (h *Handler) finishSend(ctx context.Context, p queue.AccountJob, status, ch, code, mid string) {
	_, _ = h.d.DB.ExecContext(ctx, `
		INSERT INTO send_jobs (public_id, user_id, account_id, friend_id, channel, kind, dry_run, body, status, error_code, platform_msg_id, created_at, finished_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
		ON DUPLICATE KEY UPDATE status = VALUES(status), error_code = VALUES(error_code), channel = VALUES(channel), platform_msg_id = VALUES(platform_msg_id), finished_at = UTC_TIMESTAMP()`,
		func() string {
			if p.JobID != "" {
				return p.JobID
			}
			return id.New()
		}(), p.UserID, p.AccountID, nullIfZero(p.FriendID), ch, defaultKind(p.Kind), p.DryRun, p.Body, status, code, mid)
	h.jobResult(ctx, p.JobID, map[string]any{
		"ok":              status == "ok",
		"status":          status,
		"channel":         ch,
		"error_code":      code,
		"platform_msg_id": mid,
	})
}

func (h *Handler) userPlanValid(ctx context.Context, userID int64) bool {
	var ends time.Time
	err := h.d.DB.QueryRowContext(ctx, `
		SELECT s.ends_at FROM subscriptions s
		WHERE s.user_id = ? AND s.status = 'active' AND s.ends_at > UTC_TIMESTAMP()
		ORDER BY s.ends_at DESC LIMIT 1`, userID).Scan(&ends)
	return err == nil && ends.After(time.Now().UTC())
}

func nullIfZero(n int64) any {
	if n == 0 {
		return nil
	}
	return n
}

func defaultKind(s string) string {
	if s == "" {
		return "text"
	}
	return s
}
