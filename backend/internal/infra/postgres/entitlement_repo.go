package postgres

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
)

type EntitlementRepo struct {
	pool *pgxpool.Pool
}

func NewEntitlementRepo(pool *pgxpool.Pool) *EntitlementRepo { return &EntitlementRepo{pool: pool} }

// ---- plans ----

const planCols = `id, public_id, code, name, status, account_quota, task_quota, daily_send_quota, features_json, created_at, updated_at`

func scanPlan(row pgx.Row) (*entitlement.Plan, error) {
	var p entitlement.Plan
	var feats []byte
	err := row.Scan(&p.ID, &p.PublicID, &p.Code, &p.Name, &p.Status,
		&p.AccountQuota, &p.TaskQuota, &p.DailySendQuota, &feats, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	p.Features = map[string]bool{}
	if len(feats) > 0 {
		_ = json.Unmarshal(feats, &p.Features)
	}
	return &p, nil
}

func (r *EntitlementRepo) CreatePlan(ctx context.Context, p *entitlement.Plan) error {
	feats, err := json.Marshal(p.Features)
	if err != nil {
		return err
	}
	err = From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO entitlement_plans (public_id, code, name, status, account_quota, task_quota, daily_send_quota, features_json, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id
	`, p.PublicID, p.Code, p.Name, p.Status, p.AccountQuota, p.TaskQuota, p.DailySendQuota, feats, p.CreatedAt, p.UpdatedAt).Scan(&p.ID)
	if isUniqueViolation(err) {
		return apperr.Conflict(apperr.CodeConflict, "plan code already exists")
	}
	return err
}

func (r *EntitlementRepo) DisablePlan(ctx context.Context, actorID int64, publicID uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var id int64
	if err := tx.QueryRow(ctx, `SELECT id FROM entitlement_plans WHERE public_id=$1 FOR UPDATE`, publicID).Scan(&id); err != nil {
		return mapNoRows(err, apperr.CodeNotFound, "entitlement plan not found")
	}
	if _, err := tx.Exec(ctx, `UPDATE entitlement_plans SET status='disabled', updated_at=now() WHERE id=$1`, id); err != nil {
		return err
	}
	detail, _ := json.Marshal(map[string]any{"status": "disabled"})
	if _, err := tx.Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail_json)
		VALUES ($1,'entitlement.plan.disable','entitlement_plan',$2,$3)`, actorID, publicID.String(), detail); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *EntitlementRepo) GetPlanByPublicID(ctx context.Context, publicID uuid.UUID) (*entitlement.Plan, error) {
	p, err := scanPlan(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+planCols+` FROM entitlement_plans WHERE public_id = $1`, publicID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "plan not found")
	}
	return p, nil
}

func (r *EntitlementRepo) GetPlanByID(ctx context.Context, id int64) (*entitlement.Plan, error) {
	p, err := scanPlan(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+planCols+` FROM entitlement_plans WHERE id = $1`, id))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "plan not found")
	}
	return p, nil
}

func (r *EntitlementRepo) ListPlans(ctx context.Context) ([]*entitlement.Plan, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `SELECT `+planCols+` FROM entitlement_plans ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*entitlement.Plan
	for rows.Next() {
		p, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ---- batches + codes ----

const batchCols = `id, public_id, entitlement_plan_id, name, duration_days, quantity, status, code_version, redeem_not_before, redeem_before, created_by, COALESCE(note, ''), created_at, updated_at`

func scanBatch(row pgx.Row) (*entitlement.CardBatch, error) {
	var b entitlement.CardBatch
	err := row.Scan(&b.ID, &b.PublicID, &b.EntitlementPlanID, &b.Name, &b.DurationDays, &b.Quantity,
		&b.Status, &b.CodeVersion, &b.RedeemNotBefore, &b.RedeemBefore, &b.CreatedBy, &b.Note, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (r *EntitlementRepo) CreateBatch(ctx context.Context, b *entitlement.CardBatch) error {
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO card_batches (public_id, entitlement_plan_id, name, duration_days, quantity, status, code_version, redeem_not_before, redeem_before, created_by, note, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING id
	`, b.PublicID, b.EntitlementPlanID, b.Name, b.DurationDays, b.Quantity, b.Status, b.CodeVersion,
		b.RedeemNotBefore, b.RedeemBefore, b.CreatedBy, b.Note, b.CreatedAt, b.UpdatedAt).Scan(&b.ID)
}

func (r *EntitlementRepo) ListSummaries(ctx context.Context, limit int) ([]entitlement.CardBatchSummary, error) {
	return r.listBatchSummaries(ctx, limit, nil)
}

func (r *EntitlementRepo) GetSummaryByPublicID(ctx context.Context, publicID uuid.UUID) (entitlement.CardBatchSummary, error) {
	items, err := r.listBatchSummaries(ctx, 1, &publicID)
	if err != nil {
		return entitlement.CardBatchSummary{}, err
	}
	if len(items) != 1 {
		return entitlement.CardBatchSummary{}, apperr.NotFound(apperr.CodeNotFound, "card batch not found")
	}
	return items[0], nil
}

func (r *EntitlementRepo) listBatchSummaries(ctx context.Context, limit int, publicID *uuid.UUID) ([]entitlement.CardBatchSummary, error) {
	var filter any
	if publicID != nil {
		filter = *publicID
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT b.id, b.public_id, b.entitlement_plan_id, b.name, b.duration_days, b.quantity,
			b.status, b.code_version, b.redeem_not_before, b.redeem_before, b.created_by,
			COALESCE(b.note, ''), b.created_at, b.updated_at,
			p.code, p.name, u.display_name,
			COUNT(*) FILTER (WHERE c.status='unused')::int,
			COUNT(*) FILTER (WHERE c.status='redeemed')::int,
			COUNT(*) FILTER (WHERE c.status='revoked')::int
		FROM card_batches b
		JOIN entitlement_plans p ON p.id=b.entitlement_plan_id
		JOIN users u ON u.id=b.created_by
		LEFT JOIN card_codes c ON c.batch_id=b.id
		WHERE ($2::uuid IS NULL OR b.public_id=$2)
		GROUP BY b.id, p.code, p.name, u.display_name
		ORDER BY b.created_at DESC, b.id DESC
		LIMIT $1`, limit, filter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]entitlement.CardBatchSummary, 0)
	for rows.Next() {
		var item entitlement.CardBatchSummary
		if err := rows.Scan(
			&item.ID, &item.PublicID, &item.EntitlementPlanID, &item.Name, &item.DurationDays, &item.Quantity,
			&item.Status, &item.CodeVersion, &item.RedeemNotBefore, &item.RedeemBefore, &item.CreatedBy,
			&item.Note, &item.CreatedAt, &item.UpdatedAt, &item.PlanCode, &item.PlanName,
			&item.CreatedByDisplayName, &item.UnusedCount, &item.RedeemedCount, &item.RevokedCount,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *EntitlementRepo) DisableBatch(ctx context.Context, actorID int64, publicID uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var id int64
	if err := tx.QueryRow(ctx, `SELECT id FROM card_batches WHERE public_id=$1 FOR UPDATE`, publicID).Scan(&id); err != nil {
		return mapNoRows(err, apperr.CodeNotFound, "card batch not found")
	}
	if _, err := tx.Exec(ctx, `UPDATE card_batches SET status='disabled', updated_at=now() WHERE id=$1`, id); err != nil {
		return err
	}
	detail, _ := json.Marshal(map[string]any{"status": "disabled"})
	if _, err := tx.Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail_json)
		VALUES ($1,'entitlement.batch.disable','card_batch',$2,$3)`, actorID, publicID.String(), detail); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *EntitlementRepo) ListCodeSummaries(ctx context.Context, batchPublicID uuid.UUID, limit int) ([]entitlement.CardCodeSummary, error) {
	var exists bool
	if err := From(ctx, r.pool).QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM card_batches WHERE public_id=$1)`, batchPublicID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, apperr.NotFound(apperr.CodeNotFound, "card batch not found")
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT cc.id, cc.code_fingerprint, cc.status, cc.redeemed_at, cc.revoked_at, cc.created_at
		FROM card_codes cc
		JOIN card_batches b ON b.id=cc.batch_id
		WHERE b.public_id=$1
		ORDER BY cc.id
		LIMIT $2`, batchPublicID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]entitlement.CardCodeSummary, 0)
	for rows.Next() {
		var item entitlement.CardCodeSummary
		if err := rows.Scan(&item.ID, &item.CodeFingerprint, &item.Status, &item.RedeemedAt, &item.RevokedAt, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *EntitlementRepo) RevokeUnusedCode(ctx context.Context, actorID int64, batchPublicID uuid.UUID, codeID int64, reason string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var status, fingerprint string
	if err := tx.QueryRow(ctx, `
		SELECT cc.status, cc.code_fingerprint
		FROM card_codes cc
		JOIN card_batches b ON b.id=cc.batch_id
		WHERE b.public_id=$1 AND cc.id=$2
		FOR UPDATE OF cc`, batchPublicID, codeID).Scan(&status, &fingerprint); err != nil {
		return mapNoRows(err, apperr.CodeNotFound, "card code not found")
	}
	if status != "unused" {
		return apperr.Conflict(apperr.CodeConflict, "only unused card codes can be revoked")
	}
	if _, err := tx.Exec(ctx, `UPDATE card_codes SET status='revoked', revoked_at=now() WHERE id=$1`, codeID); err != nil {
		return err
	}
	detail, _ := json.Marshal(map[string]any{"reason": reason, "status": "revoked"})
	if _, err := tx.Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail_json)
		VALUES ($1,'entitlement.card_code.revoke','card_code',$2,$3)`, actorID, fingerprint, detail); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *EntitlementRepo) InsertCodes(ctx context.Context, batchID int64, codes []*entitlement.CardCode) error {
	db := From(ctx, r.pool)
	for _, c := range codes {
		var id int64
		err := db.QueryRow(ctx, `
			INSERT INTO card_codes (batch_id, code_hash, code_fingerprint, created_at)
			VALUES ($1,$2,$3,$4)
			RETURNING id
		`, batchID, c.CodeHash, c.CodeFingerprint, time.Now()).Scan(&id)
		if err != nil {
			return err
		}
		c.ID = id
	}
	return nil
}

func (r *EntitlementRepo) GetCodeByHashForUpdate(ctx context.Context, hash []byte) (*entitlement.CardCode, error) {
	var c entitlement.CardCode
	var batchID int64
	row := From(ctx, r.pool).QueryRow(ctx, `
		SELECT cc.id, cc.batch_id, cc.status, cc.redeemed_by, cc.redeemed_at, cc.revoked_at, cc.created_at
		FROM card_codes cc
		WHERE cc.code_hash = $1
		FOR UPDATE OF cc
	`, hash)
	err := row.Scan(&c.ID, &batchID, &c.Status, &c.RedeemedBy, &c.RedeemedAt, &c.RevokedAt, &c.CreatedAt)
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "card code not found")
	}
	// Join batch + plan.
	b, err := scanBatch(From(ctx, r.pool).QueryRow(ctx, `SELECT `+batchCols+` FROM card_batches WHERE id = $1`, batchID))
	if err != nil {
		return nil, err
	}
	plan, err := scanPlan(From(ctx, r.pool).QueryRow(ctx, `SELECT `+planCols+` FROM entitlement_plans WHERE id = $1`, b.EntitlementPlanID))
	if err != nil {
		return nil, err
	}
	c.BatchID = batchID
	c.Batch, c.Plan = b, plan
	return &c, nil
}

func (r *EntitlementRepo) MarkCodeRedeemed(ctx context.Context, codeID, userID int64, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE card_codes SET status='redeemed', redeemed_by=$2, redeemed_at=$3
		WHERE id=$1 AND status='unused'
	`, codeID, userID, at)
	return err
}

// ---- grants ----

const grantCols = `g.id, g.public_id, g.user_id, g.entitlement_plan_id, g.source_type, g.source_card_id, g.starts_at, g.expires_at, g.revoked_at, g.revoke_reason, g.created_at`

func scanGrant(row pgx.Row) (*entitlement.Grant, error) {
	var g entitlement.Grant
	err := row.Scan(&g.ID, &g.PublicID, &g.UserID, &g.EntitlementPlanID, &g.SourceType, &g.SourceCardID,
		&g.StartsAt, &g.ExpiresAt, &g.RevokedAt, &g.RevokeReason, &g.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &g, nil
}

func (r *EntitlementRepo) CreateGrant(ctx context.Context, g *entitlement.Grant) error {
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO entitlement_grants (public_id, user_id, entitlement_plan_id, source_type, source_card_id, starts_at, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id
	`, g.PublicID, g.UserID, g.EntitlementPlanID, g.SourceType, g.SourceCardID, g.StartsAt, g.ExpiresAt).Scan(&g.ID)
}

func (r *EntitlementRepo) GetLastNonRevokedGrant(ctx context.Context, userID int64) (*entitlement.Grant, error) {
	g, err := scanGrant(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+grantCols+` FROM entitlement_grants g
		WHERE g.user_id = $1 AND g.revoked_at IS NULL
		ORDER BY g.expires_at DESC, g.id DESC
		LIMIT 1
	`, userID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "grant not found")
	}
	return g, nil
}

func (r *EntitlementRepo) GetEffectiveGrant(ctx context.Context, userID int64, now time.Time) (*entitlement.Grant, bool, error) {
	g, err := scanGrant(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+grantCols+` FROM entitlement_grants g
		WHERE g.user_id = $1 AND g.revoked_at IS NULL
		  AND g.starts_at <= $2 AND $2 < g.expires_at
		ORDER BY g.expires_at DESC
		LIMIT 1
	`, userID, now))
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, false, nil
		}
		return nil, false, err
	}
	plan, err := scanPlan(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+planCols+` FROM entitlement_plans WHERE id = $1`, g.EntitlementPlanID))
	if err != nil {
		return nil, false, err
	}
	g.Plan = plan
	return g, true, nil
}

func (r *EntitlementRepo) GetGrantBySourceCardID(ctx context.Context, cardID int64) (*entitlement.Grant, error) {
	g, err := scanGrant(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+grantCols+` FROM entitlement_grants g WHERE g.source_card_id=$1`, cardID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "entitlement grant not found")
	}
	plan, err := scanPlan(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+planCols+` FROM entitlement_plans WHERE id=$1`, g.EntitlementPlanID))
	if err != nil {
		return nil, err
	}
	g.Plan = plan
	return g, nil
}

func (r *EntitlementRepo) ListExpiringGrants(ctx context.Context, now, until time.Time, limit int) ([]entitlement.ExpiringGrant, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT g.user_id, g.public_id, p.code, g.expires_at
		FROM entitlement_grants g
		JOIN entitlement_plans p ON p.id=g.entitlement_plan_id
		LEFT JOIN notifications n ON n.user_id=g.user_id
		  AND n.dedupe_key = 'entitlement-expiry:' || g.public_id::text || ':' ||
		    CASE
		      WHEN g.expires_at <= $1 + interval '1 day' THEN '1'
		      WHEN g.expires_at <= $1 + interval '3 days' THEN '3'
		      ELSE '7'
		    END
		WHERE g.revoked_at IS NULL AND g.starts_at <= $1
		  AND g.expires_at > $1 AND g.expires_at <= $2 AND n.id IS NULL
		ORDER BY g.expires_at, g.id
		LIMIT $3`, now, until, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]entitlement.ExpiringGrant, 0)
	for rows.Next() {
		var item entitlement.ExpiringGrant
		if err := rows.Scan(&item.UserID, &item.PublicID, &item.PlanCode, &item.ExpiresAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *EntitlementRepo) RevokeGrant(ctx context.Context, grantID, byUserID int64, reason string) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE entitlement_grants SET revoked_at=now(), revoked_by=$2, revoke_reason=$3
		WHERE id=$1 AND revoked_at IS NULL
	`, grantID, byUserID, reason)
	return err
}

func (r *EntitlementRepo) GetGrantByPublicID(ctx context.Context, publicID uuid.UUID) (*entitlement.Grant, error) {
	g, err := scanGrant(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+grantCols+` FROM entitlement_grants g WHERE g.public_id=$1`, publicID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "entitlement grant not found")
	}
	return g, nil
}

func (r *EntitlementRepo) RevokeGrantByPublicID(ctx context.Context, actorID int64, publicID uuid.UUID, reason string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var grantID int64
	var revokedAt *time.Time
	if err := tx.QueryRow(ctx, `
		SELECT id, revoked_at FROM entitlement_grants WHERE public_id=$1 FOR UPDATE`, publicID).Scan(&grantID, &revokedAt); err != nil {
		return mapNoRows(err, apperr.CodeNotFound, "entitlement grant not found")
	}
	if revokedAt != nil {
		return apperr.Conflict(apperr.CodeConflict, "entitlement grant already revoked")
	}
	if _, err := tx.Exec(ctx, `
		UPDATE entitlement_grants SET revoked_at=now(), revoked_by=$2, revoke_reason=$3 WHERE id=$1`, grantID, actorID, reason); err != nil {
		return err
	}
	detail, _ := json.Marshal(map[string]any{"reason": reason, "status": "revoked"})
	if _, err := tx.Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail_json)
		VALUES ($1,'entitlement.grant.revoke','entitlement_grant',$2,$3)`, actorID, publicID.String(), detail); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *EntitlementRepo) ListRedemptionSummaries(ctx context.Context, limit int) ([]entitlement.RedemptionSummary, error) {
	return r.listGrantSummaries(ctx, limit, nil)
}

func (r *EntitlementRepo) ListUserGrantSummaries(ctx context.Context, userID int64, limit int) ([]entitlement.RedemptionSummary, error) {
	return r.listGrantSummaries(ctx, limit, &userID)
}

func (r *EntitlementRepo) listGrantSummaries(ctx context.Context, limit int, userID *int64) ([]entitlement.RedemptionSummary, error) {
	var userFilter any
	if userID != nil {
		userFilter = *userID
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT g.public_id, u.public_id, u.display_name, p.public_id, p.code, p.name, g.source_type,
			g.starts_at, g.expires_at, c.redeemed_at, g.revoked_at, g.revoke_reason,
			c.code_fingerprint, g.created_at
		FROM entitlement_grants g
		JOIN users u ON u.id=g.user_id
		JOIN entitlement_plans p ON p.id=g.entitlement_plan_id
		LEFT JOIN card_codes c ON c.id=g.source_card_id
		WHERE ($2::bigint IS NULL OR g.user_id=$2)
		ORDER BY g.created_at DESC, g.id DESC
		LIMIT $1`, limit, userFilter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]entitlement.RedemptionSummary, 0)
	for rows.Next() {
		var item entitlement.RedemptionSummary
		if err := rows.Scan(
			&item.GrantPublicID, &item.UserPublicID, &item.UserDisplayName, &item.PlanPublicID, &item.PlanCode, &item.PlanName,
			&item.SourceType, &item.StartsAt, &item.ExpiresAt, &item.RedeemedAt, &item.RevokedAt, &item.RevokeReason,
			&item.CodeFingerprint, &item.CreatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ---- daily usage ----

func (r *EntitlementRepo) ReserveDailySend(ctx context.Context, userID int64, localDate string, limit int) (bool, error) {
	var reserved int
	err := From(ctx, r.pool).QueryRow(ctx, `
		WITH lim AS (SELECT $3::int AS limit_value)
		INSERT INTO entitlement_daily_usage (user_id, local_date, reserved_send_count, updated_at)
		SELECT $1, $2, 1, now() FROM lim WHERE limit_value > 0
		ON CONFLICT (user_id, local_date)
		DO UPDATE SET reserved_send_count = entitlement_daily_usage.reserved_send_count + 1, updated_at = now()
		WHERE entitlement_daily_usage.reserved_send_count < $3
		RETURNING reserved_send_count
	`, userID, localDate, limit).Scan(&reserved)
	if err != nil {
		if err == pgx.ErrNoRows {
			return false, nil // limit reached
		}
		return false, err
	}
	return true, nil
}

func (r *EntitlementRepo) GetDailyUsage(ctx context.Context, userID int64, localDate string) (*entitlement.DailyUsage, error) {
	var d entitlement.DailyUsage
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT user_id, local_date::text, reserved_send_count, succeeded_send_count, failed_send_count
		FROM entitlement_daily_usage WHERE user_id=$1 AND local_date=$2
	`, userID, localDate).Scan(&d.UserID, &d.LocalDate, &d.ReservedSendCount, &d.SucceededSendCount, &d.FailedSendCount)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &d, nil
}

func (r *EntitlementRepo) IncrSucceeded(ctx context.Context, userID int64, localDate string) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE entitlement_daily_usage SET succeeded_send_count = succeeded_send_count + 1, updated_at = now()
		WHERE user_id=$1 AND local_date=$2`, userID, localDate)
	return err
}

func (r *EntitlementRepo) IncrFailed(ctx context.Context, userID int64, localDate string) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE entitlement_daily_usage SET failed_send_count = failed_send_count + 1, updated_at = now()
		WHERE user_id=$1 AND local_date=$2`, userID, localDate)
	return err
}

func (r *EntitlementRepo) ReleaseDailySend(ctx context.Context, userID int64, localDate string) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE entitlement_daily_usage
		SET reserved_send_count = GREATEST(0, reserved_send_count - 1), updated_at = now()
		WHERE user_id=$1 AND local_date=$2`, userID, localDate)
	return err
}

// ---- audit sink (entitlement.AuditSink) ----

func (r *EntitlementRepo) Record(ctx context.Context, actorID *int64, action, resourceType, resourceID string, detail map[string]any) error {
	b, _ := json.Marshal(detail)
	if b == nil {
		b = []byte("{}")
	}
	_, err := From(ctx, r.pool).Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail_json)
		VALUES ($1,$2,$3,$4,$5)
	`, actorID, action, resourceType, resourceID, b)
	return err
}

var _ entitlement.AuditSink = (*EntitlementRepo)(nil)
