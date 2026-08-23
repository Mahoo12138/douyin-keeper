package webapi

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"huohua/internal/billing"
	"huohua/internal/id"
)

type redeemReq struct {
	Code string `json:"code"`
}

type purchaseReq struct {
	PlanCode string `json:"plan_code"`
}

type createKeysReq struct {
	Kind        string `json:"kind"`
	Quantity    int    `json:"quantity"`
	AmountCents int64  `json:"amount_cents"`
	PlanCode    string `json:"plan_code"`
	Remark      string `json:"remark"`
}

func (s *Server) settingInt(k string, def int) int {
	n, err := strconv.Atoi(strings.TrimSpace(s.setting(k, "")))
	if err != nil {
		return def
	}
	return n
}

func (s *Server) wallet(c *gin.Context) {
	u := currentUser(c)
	ent, err := s.loadEntitlement(c.Request.Context(), u.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取钱包失败")
		return
	}
	price := int64(s.settingInt("billing.add_account_price_cents", 3000))
	maxSlots := int64(s.settingInt("douyin.max_accounts_per_user", 10))
	quota, _ := ent["slot_quota"].(int)
	valid, _ := ent["valid"].(bool)
	var balance int64
	_ = s.db.QueryRowContext(c.Request.Context(), `SELECT balance_cents FROM users WHERE id = ?`, u.ID).Scan(&balance)
	okAdd, reason := billing.CanAddSlot(valid, int64(quota), maxSlots, balance, price)
	plans, err := s.listSellablePlans(c.Request.Context())
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取套餐失败")
		return
	}
	ok(c, gin.H{
		"balance_cents":    balance,
		"entitlement":      ent,
		"add_price_cents":  price,
		"max_slots":        maxSlots,
		"can_add":          okAdd,
		"cannot_add_reason": reason,
		"plans":            plans,
	})
}

func (s *Server) walletLedgers(c *gin.Context) {
	u := currentUser(c)
	rows, err := s.db.QueryContext(c.Request.Context(), `
		SELECT type, delta_cents, balance_after, remark, created_at
		FROM balance_ledgers WHERE user_id = ? ORDER BY id DESC LIMIT 50`, u.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "读取账变失败")
		return
	}
	defer rows.Close()
	list := make([]gin.H, 0)
	for rows.Next() {
		var typ, remark string
		var delta, after int64
		var at time.Time
		if err := rows.Scan(&typ, &delta, &after, &remark, &at); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "读取账变失败")
			return
		}
		list = append(list, gin.H{"type": typ, "delta_cents": delta, "balance_after": after, "remark": remark, "created_at": at.UTC().Format(time.RFC3339)})
	}
	ok(c, gin.H{"items": list})
}

func (s *Server) listSellablePlans(ctx context.Context) ([]gin.H, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT code, name, duration_days, price_cents FROM plans
		WHERE is_active = 1 AND code <> 'trial' ORDER BY duration_days`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]gin.H, 0, 4)
	for rows.Next() {
		var code, name string
		var days int
		var price int64
		if err := rows.Scan(&code, &name, &days, &price); err != nil {
			return nil, err
		}
		out = append(out, gin.H{"code": code, "name": name, "duration_days": days, "price_cents": price})
	}
	return out, rows.Err()
}

func (s *Server) redeem(c *gin.Context) {
	u := currentUser(c)
	var req redeemReq
	if !bindJSON(c, &req) {
		return
	}
	norm := billing.NormalizeCode(req.Code)
	if len(norm) < 8 {
		fail(c, http.StatusBadRequest, "bad_code", "卡密无效")
		return
	}
	if !s.allowRate(c, "rl:redeem:user:"+strconv.FormatInt(u.ID, 10), 20, time.Hour) {
		return
	}
	ctx := c.Request.Context()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "兑换失败")
		return
	}
	defer func() { _ = tx.Rollback() }()
	var keyID int64
	var kind string
	var planID sql.NullInt64
	var amount int64
	var status string
	err = tx.QueryRowContext(ctx, `
		SELECT id, kind, plan_id, amount_cents, status FROM card_keys
		WHERE code_hash = ? FOR UPDATE`, billing.HashCode(norm)).Scan(&keyID, &kind, &planID, &amount, &status)
	if err != nil {
		fail(c, http.StatusBadRequest, "bad_code", "卡密无效")
		return
	}
	if status != "unused" {
		fail(c, http.StatusConflict, "card_used", "该卡密已使用")
		return
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_cents FROM users WHERE id = ? FOR UPDATE`, u.ID).Scan(&balance); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "兑换失败")
		return
	}
	if kind == "balance" {
		if amount <= 0 {
			fail(c, http.StatusBadRequest, "bad_code", "卡密无效")
			return
		}
		balance += amount
		if _, err := tx.ExecContext(ctx, `UPDATE users SET balance_cents = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`, balance, u.ID); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "兑换失败")
			return
		}
		if err := insertLedger(ctx, tx, u.ID, "redeem_balance", amount, balance, "兑换余额卡"); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "兑换失败")
			return
		}
	} else if kind == "plan" {
		if !planID.Valid {
			fail(c, http.StatusBadRequest, "bad_code", "卡密无效")
			return
		}
		if err := s.applyPaidPlan(ctx, tx, u.ID, planID.Int64, "redeem"); err != nil {
			mapBillingErr(c, err)
			return
		}
		if err := insertLedger(ctx, tx, u.ID, "redeem_plan", 0, balance, "兑换套餐卡"); err != nil {
			fail(c, http.StatusInternalServerError, "internal", "兑换失败")
			return
		}
	} else {
		fail(c, http.StatusBadRequest, "bad_code", "卡密无效")
		return
	}
	res, err := tx.ExecContext(ctx, `UPDATE card_keys SET status = 'used', used_by = ?, used_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'unused'`, u.ID, keyID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "兑换失败")
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		fail(c, http.StatusConflict, "card_used", "该卡密已使用")
		return
	}
	if err := tx.Commit(); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "兑换失败")
		return
	}
	s.audit(ctx, &u.ID, "card.redeem", clientIP(c), gin.H{"kind": kind})
	ent, _ := s.loadEntitlement(c.Request.Context(), u.ID)
	ok(c, gin.H{"kind": kind, "balance_cents": balance, "entitlement": ent})
}

func (s *Server) purchasePlan(c *gin.Context) {
	u := currentUser(c)
	var req purchaseReq
	if !bindJSON(c, &req) {
		return
	}
	code := strings.ToLower(strings.TrimSpace(req.PlanCode))
	if code == "" || code == "trial" {
		fail(c, http.StatusBadRequest, "bad_plan", "请选择套餐")
		return
	}
	ctx := c.Request.Context()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "购买失败")
		return
	}
	defer func() { _ = tx.Rollback() }()
	var planID, price int64
	var active int
	err = tx.QueryRowContext(ctx, `SELECT id, price_cents, is_active FROM plans WHERE code = ?`, code).Scan(&planID, &price, &active)
	if err != nil || active != 1 || price < 0 {
		fail(c, http.StatusBadRequest, "bad_plan", "套餐不存在或已下架")
		return
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_cents FROM users WHERE id = ? FOR UPDATE`, u.ID).Scan(&balance); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "购买失败")
		return
	}
	if balance < price {
		fail(c, http.StatusBadRequest, "insufficient_balance", "余额不足")
		return
	}
	balance -= price
	if _, err := tx.ExecContext(ctx, `UPDATE users SET balance_cents = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`, balance, u.ID); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "购买失败")
		return
	}
	if err := s.applyPaidPlan(ctx, tx, u.ID, planID, "purchase"); err != nil {
		mapBillingErr(c, err)
		return
	}
	if err := insertLedger(ctx, tx, u.ID, "purchase_plan", -price, balance, "购买套餐 "+code); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "购买失败")
		return
	}
	if err := tx.Commit(); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "购买失败")
		return
	}
	s.audit(ctx, &u.ID, "plan.purchase", clientIP(c), gin.H{"plan": code, "price_cents": price})
	ent, _ := s.loadEntitlement(c.Request.Context(), u.ID)
	ok(c, gin.H{"balance_cents": balance, "entitlement": ent})
}

func (s *Server) purchaseSlot(c *gin.Context) {
	u := currentUser(c)
	ctx := c.Request.Context()
	price := int64(s.settingInt("billing.add_account_price_cents", 3000))
	maxSlots := int64(s.settingInt("douyin.max_accounts_per_user", 10))
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "加号失败")
		return
	}
	defer func() { _ = tx.Rollback() }()
	var balance int64
	var quota int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_cents, slot_quota FROM users WHERE id = ? FOR UPDATE`, u.ID).Scan(&balance, &quota); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "加号失败")
		return
	}
	valid, err := userPlanValidTx(ctx, tx, u.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "加号失败")
		return
	}
	if okAdd, reason := billing.CanAddSlot(valid, quota, maxSlots, balance, price); !okAdd {
		code := "forbidden"
		status := http.StatusForbidden
		if strings.Contains(reason, "余额") {
			code = "insufficient_balance"
			status = http.StatusBadRequest
		}
		fail(c, status, code, reason)
		return
	}
	balance -= price
	quota++
	if _, err := tx.ExecContext(ctx, `UPDATE users SET balance_cents = ?, slot_quota = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`, balance, quota, u.ID); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "加号失败")
		return
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO douyin_accounts (user_id, public_id, session_status, slot_status, created_at, updated_at)
		VALUES (?, ?, 'unbound', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())`, u.ID, id.New()); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "加号失败")
		return
	}
	if err := insertLedger(ctx, tx, u.ID, "purchase_slot", -price, balance, "增加号位"); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "加号失败")
		return
	}
	if err := tx.Commit(); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "加号失败")
		return
	}
	s.audit(ctx, &u.ID, "slot.purchase", clientIP(c), gin.H{"slot_quota": quota})
	ent, _ := s.loadEntitlement(c.Request.Context(), u.ID)
	ok(c, gin.H{"balance_cents": balance, "entitlement": ent})
}

func (s *Server) applyPaidPlan(ctx context.Context, tx *sql.Tx, userID, planID int64, source string) error {
	var days int
	var active int
	if err := tx.QueryRowContext(ctx, `SELECT duration_days, is_active FROM plans WHERE id = ?`, planID).Scan(&days, &active); err != nil {
		return errBadPlan
	}
	if active != 1 || days < 1 {
		return errBadPlan
	}
	cur, err := loadCurrentSubTx(ctx, tx, userID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	d := billing.DecidePaid(now, cur, days)
	if d.CancelOld && cur != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE subscriptions SET status = 'cancelled', updated_at = UTC_TIMESTAMP() WHERE id = ?`, cur.ID); err != nil {
			return err
		}
	}
	if d.UpdateOld && cur != nil {
		_, err = tx.ExecContext(ctx, `
			UPDATE subscriptions SET plan_id = ?, source = ?, ends_at = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`,
			planID, source, d.End.UTC(), cur.ID)
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO subscriptions (user_id, plan_id, starts_at, ends_at, status, source, created_at, updated_at)
		VALUES (?, ?, ?, ?, 'active', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
		userID, planID, d.Start.UTC(), d.End.UTC(), source)
	return err
}

func loadCurrentSubTx(ctx context.Context, tx *sql.Tx, userID int64) (*billing.CurrentSub, error) {
	var cur billing.CurrentSub
	err := tx.QueryRowContext(ctx, `
		SELECT id, source, status, starts_at, ends_at FROM subscriptions
		WHERE user_id = ? AND status = 'active' ORDER BY ends_at DESC LIMIT 1 FOR UPDATE`, userID).Scan(
		&cur.ID, &cur.Source, &cur.Status, &cur.StartsAt, &cur.EndsAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &cur, nil
}

func userPlanValidTx(ctx context.Context, tx *sql.Tx, userID int64) (bool, error) {
	var ends time.Time
	err := tx.QueryRowContext(ctx, `
		SELECT ends_at FROM subscriptions
		WHERE user_id = ? AND status = 'active' AND ends_at > UTC_TIMESTAMP()
		ORDER BY ends_at DESC LIMIT 1`, userID).Scan(&ends)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func insertLedger(ctx context.Context, tx *sql.Tx, userID int64, typ string, delta, after int64, remark string) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO balance_ledgers (user_id, type, delta_cents, balance_after, remark, created_at)
		VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`, userID, typ, delta, after, remark)
	return err
}

func (s *Server) adminCreateKeys(c *gin.Context) {
	u := currentUser(c)
	var req createKeysReq
	if !bindJSON(c, &req) {
		return
	}
	if req.Quantity < 1 || req.Quantity > 50 {
		fail(c, http.StatusBadRequest, "bad_request", "数量须为 1–50")
		return
	}
	kind := strings.ToLower(strings.TrimSpace(req.Kind))
	var planID sql.NullInt64
	if kind == "balance" {
		if req.AmountCents < 1 {
			fail(c, http.StatusBadRequest, "bad_request", "余额卡金额须大于 0")
			return
		}
	} else if kind == "plan" {
		var idv int64
		err := s.db.QueryRowContext(c.Request.Context(), `SELECT id FROM plans WHERE code = ? AND is_active = 1 AND code <> 'trial'`, strings.ToLower(req.PlanCode)).Scan(&idv)
		if err != nil {
			fail(c, http.StatusBadRequest, "bad_plan", "套餐不存在")
			return
		}
		planID = sql.NullInt64{Int64: idv, Valid: true}
	} else {
		fail(c, http.StatusBadRequest, "bad_request", "类型须为 balance 或 plan")
		return
	}
	ctx := c.Request.Context()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "创建失败")
		return
	}
	defer func() { _ = tx.Rollback() }()
	res, err := tx.ExecContext(ctx, `
		INSERT INTO card_batches (public_id, kind, plan_id, amount_cents, quantity, remark, created_by, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
		id.New(), kind, nullable(planID), req.AmountCents, req.Quantity, strings.TrimSpace(req.Remark), u.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "创建失败")
		return
	}
	batchID, _ := res.LastInsertId()
	codes := make([]string, 0, req.Quantity)
	for i := 0; i < req.Quantity; i++ {
		raw, err := billing.RandomCardCode()
		if err != nil {
			fail(c, http.StatusInternalServerError, "internal", "创建失败")
			return
		}
		_, err = tx.ExecContext(ctx, `
			INSERT INTO card_keys (batch_id, code_hash, kind, plan_id, amount_cents, status, created_at)
			VALUES (?, ?, ?, ?, ?, 'unused', UTC_TIMESTAMP())`,
			batchID, billing.HashCode(raw), kind, nullable(planID), req.AmountCents)
		if err != nil {
			fail(c, http.StatusInternalServerError, "internal", "创建失败")
			return
		}
		codes = append(codes, billing.FormatCode(raw))
	}
	if err := tx.Commit(); err != nil {
		fail(c, http.StatusInternalServerError, "internal", "创建失败")
		return
	}
	s.audit(ctx, &u.ID, "card.batch_create", clientIP(c), gin.H{"kind": kind, "quantity": req.Quantity})
	ok(c, gin.H{"codes": codes, "kind": kind})
}

func nullable(n sql.NullInt64) any {
	if !n.Valid {
		return nil
	}
	return n.Int64
}

var errBadPlan = errString("bad plan")

func mapBillingErr(c *gin.Context, err error) {
	if err == errBadPlan {
		fail(c, http.StatusBadRequest, "bad_plan", "套餐不存在或已下架")
		return
	}
	fail(c, http.StatusInternalServerError, "internal", "处理套餐失败")
}
