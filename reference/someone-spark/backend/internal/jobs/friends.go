package jobs

import (
	"context"
	"database/sql"
	"time"

	"github.com/hibiken/asynq"

	"huohua/internal/id"
	"huohua/internal/queue"
)

func (h *Handler) FriendsSync(ctx context.Context, t *asynq.Task) error {
	p, err := parseJob(t)
	if err != nil {
		return err
	}
	ok, unlock := h.lockFor(ctx, p.AccountID, 4*time.Minute)
	if !ok {
		h.jobResult(ctx, p.JobID, map[string]any{"ok": false, "code": "busy"})
		return nil
	}
	defer unlock()
	if !h.userPlanValid(ctx, p.UserID) {
		h.jobResult(ctx, p.JobID, map[string]any{"ok": false, "code": "plan_required", "message": "套餐无效，无法同步"})
		return nil
	}
	stateIn, cleanup, err := h.writeStateIn(ctx, p)
	if err != nil {
		h.jobResult(ctx, p.JobID, map[string]any{"ok": false, "code": "no_session", "message": "请先登录该号"})
		return nil
	}
	defer cleanup()
	last, code := h.sidecarLast(ctx, 150*time.Second, map[string]any{
		"op":        "list_friends",
		"public_id": p.PublicID,
		"state_in":  stateIn,
	})
	if code != "" && !boolField(last, "ok") {
		h.maybeExpire(ctx, p, code)
		h.jobResult(ctx, p.JobID, map[string]any{"ok": false, "code": code, "message": strField(last, "message")})
		return nil
	}
	n := 0
	for _, item := range asSlice(last["friends"]) {
		fm := asMap(item)
		name := strField(fm, "display_name")
		if name == "" {
			name = strField(fm, "name")
		}
		if name == "" {
			continue
		}
		if err := h.upsertFriend(ctx, p.AccountID, name, fm); err != nil {
			h.jobResult(ctx, p.JobID, map[string]any{"ok": false, "code": "db", "message": "写入好友失败"})
			return err
		}
		n++
	}
	h.mergeCreatorFriends(ctx, p, stateIn)
	h.refreshStickers(ctx, p, stateIn)
	h.jobResult(ctx, p.JobID, map[string]any{"ok": true, "count": n})
	return nil
}

func (h *Handler) mergeCreatorFriends(ctx context.Context, p queue.AccountJob, stateIn string) {
	last, _ := h.sidecarLast(ctx, 90*time.Second, map[string]any{
		"op":        "harvest_creator_map",
		"public_id": p.PublicID,
		"state_in":  stateIn,
	})
	for _, item := range asSlice(last["friends"]) {
		fm := asMap(item)
		name := strField(fm, "display_name")
		if name == "" {
			name = strField(fm, "nickname")
		}
		if name == "" {
			continue
		}
		var existing int64
		err := h.d.DB.QueryRowContext(ctx, `SELECT id FROM friends WHERE account_id = ? AND display_name = ?`, p.AccountID, name).Scan(&existing)
		if err == nil {
			continue
		}
		if fm["has_conversation"] == nil {
			fm["has_conversation"] = false
		}
		_ = h.upsertFriend(ctx, p.AccountID, name, fm)
	}
}

func (h *Handler) refreshStickers(ctx context.Context, p queue.AccountJob, stateIn string) {
	var name string
	_ = h.d.DB.QueryRowContext(ctx, `SELECT display_name FROM friends WHERE account_id = ? ORDER BY id ASC LIMIT 1`, p.AccountID).Scan(&name)
	last, _ := h.sidecarLast(ctx, 70*time.Second, map[string]any{
		"op":                  "list_stickers",
		"public_id":           p.PublicID,
		"state_in":            stateIn,
		"friend_display_name": name,
	})
	for _, item := range asSlice(last["stickers"]) {
		sm := asMap(item)
		key := strField(sm, "sticker_key")
		if key == "" {
			continue
		}
		_, _ = h.d.DB.ExecContext(ctx, `
			INSERT INTO stickers_cache (account_id, sticker_key, name, preview_url, updated_at)
			VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
			ON DUPLICATE KEY UPDATE name = VALUES(name), preview_url = VALUES(preview_url), updated_at = UTC_TIMESTAMP()`,
			p.AccountID, key, strField(sm, "name"), strField(sm, "preview_url"))
	}
}

func (h *Handler) upsertFriend(ctx context.Context, accountID int64, name string, fm map[string]any) error {
	var existing int64
	err := h.d.DB.QueryRowContext(ctx, `SELECT id FROM friends WHERE account_id = ? AND display_name = ?`, accountID, name).Scan(&existing)
	if err == sql.ErrNoRows {
		_, err = h.d.DB.ExecContext(ctx, `
			INSERT INTO friends
			  (public_id, account_id, display_name, nickname, short_id, avatar_url, streak_days, has_conversation, spark_enabled, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
			id.New(), accountID, name, strField(fm, "nickname"), strField(fm, "short_id"),
			strField(fm, "avatar_url"), intField(fm, "streak_days"), boolField(fm, "has_conversation"))
		return err
	}
	if err != nil {
		return err
	}
	_, err = h.d.DB.ExecContext(ctx, `
		UPDATE friends
		SET nickname = ?, short_id = ?, avatar_url = ?, streak_days = ?, has_conversation = ?, updated_at = UTC_TIMESTAMP()
		WHERE id = ?`,
		strField(fm, "nickname"), strField(fm, "short_id"), strField(fm, "avatar_url"),
		intField(fm, "streak_days"), boolField(fm, "has_conversation"), existing)
	return err
}
