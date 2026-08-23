package jobs

import (
	"context"
	"time"

	"github.com/hibiken/asynq"
)

func (h *Handler) ChatArchive(ctx context.Context, t *asynq.Task) error {
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
		h.jobResult(ctx, p.JobID, map[string]any{"ok": false, "code": "no_session"})
		return nil
	}
	defer cleanup()
	type target struct {
		id   int64
		name string
	}
	var list []target
	if p.FriendID > 0 {
		var name string
		err = h.d.DB.QueryRowContext(ctx, `SELECT display_name FROM friends WHERE id = ? AND account_id = ?`, p.FriendID, p.AccountID).Scan(&name)
		if err != nil {
			h.jobResult(ctx, p.JobID, map[string]any{"ok": false, "code": "not_found"})
			return nil
		}
		list = append(list, target{p.FriendID, name})
	} else {
		rows, err := h.d.DB.QueryContext(ctx, `SELECT id, display_name FROM friends WHERE account_id = ? ORDER BY id ASC`, p.AccountID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var it target
			if err := rows.Scan(&it.id, &it.name); err != nil {
				_ = rows.Close()
				return err
			}
			list = append(list, it)
		}
		_ = rows.Close()
	}
	n := 0
	for _, it := range list {
		last, code := h.sidecarLast(ctx, 80*time.Second, map[string]any{
			"op":                  "archive_messages",
			"public_id":           p.PublicID,
			"state_in":            stateIn,
			"friend_display_name": it.name,
		})
		if code != "" && !boolField(last, "ok") {
			continue
		}
		for _, item := range asSlice(last["messages"]) {
			m := asMap(item)
			body := strField(m, "body")
			if body == "" {
				continue
			}
			if err := h.insertArchive(ctx, p.UserID, p.AccountID, p.PublicID, it.id, it.name,
				strField(m, "direction"), strField(m, "msg_type"), body,
				strField(m, "platform_msg_id"), strField(m, "media_url"), "browser", time.Time{}); err == nil {
				n++
			}
		}
	}
	h.jobResult(ctx, p.JobID, map[string]any{"ok": true, "count": n})
	return nil
}
