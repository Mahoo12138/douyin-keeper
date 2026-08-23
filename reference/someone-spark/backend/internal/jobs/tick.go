package jobs

import (
	"context"
	"database/sql"
	"math/rand"
	"time"

	"github.com/hibiken/asynq"

	"huohua/internal/billing"
	"huohua/internal/clock"
	"huohua/internal/id"
	"huohua/internal/queue"
)

func (h *Handler) TaskTick(ctx context.Context, _ *asynq.Task) error {
	h.expireRisks(ctx)
	start := h.siteSetting(ctx, "send.quiet_start", "00:00")
	end := h.siteSetting(ctx, "send.quiet_end", "07:00")
	now := time.Now().UTC()
	if clock.InQuiet(now, start, end) {
		_ = h.d.RDB.Set(ctx, "tick:last", now.Format(time.RFC3339), 2*time.Hour).Err()
		return nil
	}
	if h.d.Asynq == nil {
		return nil
	}
	day := clock.LocalDate(now)
	siteLim := h.siteSettingInt(ctx, "send.daily_limit", 20)
	hard := h.siteSettingInt(ctx, "send.hard_daily_cap", 20)
	firstLim := h.siteSettingInt(ctx, "send.first_message_daily_limit", 5)
	rows, err := h.d.DB.QueryContext(ctx, `
		SELECT a.id, a.public_id, a.user_id, a.allow_first_message, p.daily_send_limit
		FROM douyin_accounts a
		JOIN subscriptions s ON s.user_id = a.user_id AND s.status = 'active' AND s.ends_at > UTC_TIMESTAMP()
		JOIN plans p ON p.id = s.plan_id
		WHERE a.slot_status = 'active' AND a.session_status = 'valid'
		  AND (a.risk_until IS NULL OR a.risk_until <= UTC_TIMESTAMP())`)
	if err != nil {
		return err
	}
	defer rows.Close()
	type acc struct {
		id, userID int64
		pid        string
		allowFirst bool
		planLim    sql.NullInt64
	}
	var list []acc
	for rows.Next() {
		var a acc
		if err := rows.Scan(&a.id, &a.pid, &a.userID, &a.allowFirst, &a.planLim); err != nil {
			return err
		}
		list = append(list, a)
	}
	gap := 20 * time.Hour
	for _, a := range list {
		cap := billing.DailyCap(siteLim, hard, int(a.planLim.Int64))
		var sent int
		_ = h.d.DB.QueryRowContext(ctx, `SELECT sent_count FROM daily_send_counters WHERE account_id = ? AND local_date = ?`, a.id, day).Scan(&sent)
		if sent >= cap {
			continue
		}
		var firstN int
		_ = h.d.DB.QueryRowContext(ctx, `SELECT sent_count FROM daily_first_message_counters WHERE account_id = ? AND local_date = ?`, a.id, day).Scan(&firstN)
		trows, err := h.d.DB.QueryContext(ctx, `
			SELECT t.id, t.friend_id, t.body, t.sticker_key, f.display_name, f.has_conversation, f.last_sent_at
			FROM spark_tasks t
			JOIN friends f ON f.id = t.friend_id AND f.account_id = t.account_id
			WHERE t.account_id = ? AND t.enabled = 1 AND f.spark_enabled = 1`, a.id)
		if err != nil {
			return err
		}
		type item struct {
			taskID, friendID int64
			body, key, name  string
			hasConv          bool
			last             sql.NullTime
		}
		var items []item
		for trows.Next() {
			var it item
			if err := trows.Scan(&it.taskID, &it.friendID, &it.body, &it.key, &it.name, &it.hasConv, &it.last); err != nil {
				_ = trows.Close()
				return err
			}
			items = append(items, it)
		}
		_ = trows.Close()
		for _, it := range items {
			if it.last.Valid && now.Sub(it.last.Time) < gap {
				continue
			}
			var exists int
			_ = h.d.DB.QueryRowContext(ctx, `SELECT 1 FROM send_uniques WHERE account_id = ? AND friend_id = ? AND local_date = ?`, a.id, it.friendID, day).Scan(&exists)
			if exists == 1 {
				continue
			}
			if !it.hasConv && firstN >= firstLim {
				continue
			}
			if !it.hasConv && !a.allowFirst {
				continue
			}
			delay := time.Duration(5+rand.Intn(86)) * time.Second
			p := queue.AccountJob{
				JobID:      id.New(),
				UserID:     a.userID,
				AccountID:  a.id,
				PublicID:   a.pid,
				FriendID:   it.friendID,
				FriendName: it.name,
				Body:       it.body,
				StickerKey: it.key,
				Kind:       "text",
			}
			if it.key != "" {
				p.Kind = "sticker"
			}
			if err := queue.EnqueueChatSendIn(ctx, h.d.Asynq, p, delay); err != nil {
				continue
			}
			_, _ = h.d.DB.ExecContext(ctx, `
				UPDATE spark_tasks SET last_enqueued_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?`, it.taskID)
			_, _ = h.d.DB.ExecContext(ctx, `
				UPDATE douyin_accounts SET next_task_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), updated_at = UTC_TIMESTAMP() WHERE id = ?`, int(delay.Seconds()), a.id)
			sent++
			if !it.hasConv {
				firstN++
			}
			if sent >= cap {
				break
			}
		}
	}
	_ = h.d.RDB.Set(ctx, "tick:last", now.Format(time.RFC3339), 2*time.Hour).Err()
	return nil
}
