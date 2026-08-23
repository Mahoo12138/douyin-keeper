package jobs

import (
	"context"
	"database/sql"
	"strconv"
	"time"
)

const riskPause = 45 * time.Minute

func (h *Handler) bustDash(ctx context.Context, userID int64) {
	_ = h.d.RDB.Del(ctx, "dash:user:"+strconv.FormatInt(userID, 10)).Err()
}

func (h *Handler) accountPaused(ctx context.Context, accountID int64) bool {
	var status string
	var until sql.NullTime
	err := h.d.DB.QueryRowContext(ctx, `
		SELECT COALESCE(risk_status, ''), risk_until
		FROM douyin_accounts WHERE id = ?`, accountID).Scan(&status, &until)
	if err != nil || status == "" {
		return false
	}
	if !until.Valid {
		return true
	}
	return until.Time.After(time.Now().UTC())
}

func (h *Handler) pauseAccount(ctx context.Context, accountID int64, status, reason string) {
	_, _ = h.d.DB.ExecContext(ctx, `
		UPDATE douyin_accounts
		SET risk_status = ?, risk_reason = ?, risk_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 45 MINUTE),
		    updated_at = UTC_TIMESTAMP()
		WHERE id = ?`, status, reason, accountID)
}

func (h *Handler) bumpFail(ctx context.Context, accountID int64) {
	_, _ = h.d.DB.ExecContext(ctx, `
		UPDATE douyin_accounts
		SET consecutive_fails = consecutive_fails + 1, updated_at = UTC_TIMESTAMP()
		WHERE id = ?`, accountID)
	var n int
	_ = h.d.DB.QueryRowContext(ctx, `SELECT consecutive_fails FROM douyin_accounts WHERE id = ?`, accountID).Scan(&n)
	if n >= 3 {
		h.pauseAccount(ctx, accountID, "paused", "连续失败暂停")
	}
}

func (h *Handler) clearRisk(ctx context.Context, accountID int64) {
	_, _ = h.d.DB.ExecContext(ctx, `
		UPDATE douyin_accounts
		SET risk_status = '', risk_reason = '', risk_until = NULL, consecutive_fails = 0, updated_at = UTC_TIMESTAMP()
		WHERE id = ?`, accountID)
}

func (h *Handler) expireRisks(ctx context.Context) {
	_, _ = h.d.DB.ExecContext(ctx, `
		UPDATE douyin_accounts
		SET risk_status = '', risk_reason = '', risk_until = NULL, updated_at = UTC_TIMESTAMP()
		WHERE risk_until IS NOT NULL AND risk_until <= UTC_TIMESTAMP()`)
}
