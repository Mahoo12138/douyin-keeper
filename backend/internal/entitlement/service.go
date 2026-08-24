package entitlement

import (
	"context"
	"crypto/subtle"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

// UserLocker serializes redeem/grant per user (docs/13 §11 "锁定 User").
// Implemented by infra/postgres with SELECT ... FOR UPDATE.
type UserLocker interface {
	LockUserForUpdate(ctx context.Context, userID int64) error
}

type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}

// Service implements the entitlement policy. GetEffective reads PostgreSQL
// directly (no Redis cache) so revocations take effect immediately (docs/13 §8).
type Service struct {
	plans    PlanRepository
	batches  BatchRepository
	grants   GrantRepository
	usage    UsageRepository
	userLock UserLocker
	tx       TxManager
	counters ResourceCounters // may be nil
	audit    AuditSink        // may be nil
	pepper   []byte
	now      func() time.Time
}

func NewService(plans PlanRepository, batches BatchRepository, grants GrantRepository,
	usage UsageRepository, userLock UserLocker, tx TxManager, pepper []byte) *Service {
	return &Service{
		plans: plans, batches: batches, grants: grants, usage: usage,
		userLock: userLock, tx: tx, pepper: pepper, now: time.Now,
	}
}

// WithCounters injects the cross-context quota counters.
func (s *Service) WithCounters(c ResourceCounters) *Service { s.counters = c; return s }

// WithAudit injects the audit sink.
func (s *Service) WithAudit(a AuditSink) *Service { s.audit = a; return s }

// SetNow overrides the clock for tests.
func (s *Service) SetNow(f func() time.Time) { s.now = f }

// EffectiveLocalDate returns the site-wide local day (docs/13 §10.3).
func EffectiveLocalDate(now time.Time) string {
	loc, err := time.LoadLocation(SiteTimezone)
	if err != nil || loc == nil {
		loc = time.UTC
	}
	return now.In(loc).Format("2006-01-02")
}

// SiteTimezone is the product-level daily-quota timezone (docs/13 §10.3).
const SiteTimezone = "Asia/Shanghai"

// GetEffective resolves the user's effective entitlement.
func (s *Service) GetEffective(ctx context.Context, userID int64) (EffectiveEntitlement, error) {
	now := s.now()
	g, ok, err := s.grants.GetEffectiveGrant(ctx, userID, now)
	if err != nil {
		return EffectiveEntitlement{}, err
	}
	eff := EffectiveEntitlement{
		AccountQuota: 0, TaskQuota: 0, DailySendQuota: 0,
		Features: map[string]bool{},
		Usage:    EntitlementUsage{},
	}
	if !ok || g == nil || g.Plan == nil {
		return eff, nil
	}
	grantPub := g.PublicID
	starts, expires := g.StartsAt, g.ExpiresAt
	eff = EffectiveEntitlement{
		Active: true, GrantID: &grantPub, PlanCode: g.Plan.Code,
		StartsAt: &starts, ExpiresAt: &expires,
		AccountQuota: g.Plan.AccountQuota, TaskQuota: g.Plan.TaskQuota,
		DailySendQuota: g.Plan.DailySendQuota, Features: g.Plan.Features,
	}
	// Quota usage.
	if s.counters != nil {
		if n, err := s.counters.CountAccountsOccupied(ctx, userID); err == nil {
			eff.Usage.AccountsUsed = n
		}
		if n, err := s.counters.CountTasks(ctx, userID); err == nil {
			eff.Usage.TasksUsed = n
		}
	}
	date := EffectiveLocalDate(now)
	if d, err := s.usage.GetDailyUsage(ctx, userID, date); err == nil && d != nil {
		eff.Usage.DailySendReserved = d.ReservedSendCount
		eff.Usage.QuotaLocalDate = date
	}
	return eff, nil
}

// Redeem consumes a card code and creates a grant. The business transaction
// locks the user row and the card row; expiry windows and plan/batch status
// are validated inside the tx (docs/13 §11).
func (s *Service) Redeem(ctx context.Context, userID int64, rawCode string) (Grant, EffectiveEntitlement, error) {
	norm, err := NormalizeCode(rawCode)
	if err != nil {
		return Grant{}, EffectiveEntitlement{}, apperr.Validation(apperr.CodeConflict, "invalid card code")
	}
	hash := HashCode(s.pepper, norm)
	now := s.now()

	var grant Grant
	err = s.tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := s.userLock.LockUserForUpdate(tctx, userID); err != nil {
			return err
		}
		code, err := s.batches.GetCodeByHashForUpdate(tctx, hash)
		if err != nil {
			if apperr.KindOf(err) == apperr.KindNotFound {
				return apperr.NotFound(apperr.CodeNotFound, "unknown card code")
			}
			return err
		}
		if err := validateCodeForRedeem(code, now); err != nil {
			return err
		}
		var last *Grant
		if last, err = s.grants.GetLastNonRevokedGrant(tctx, userID); err != nil {
			if apperr.KindOf(err) != apperr.KindNotFound {
				return err
			}
			last = nil // first grant ever: anchor at now
		}
		if err := validatePlanRenewal(last, code.Batch.EntitlementPlanID, now); err != nil {
			return err
		}
		anchor := now
		if last != nil && last.ExpiresAt.After(anchor) {
			anchor = last.ExpiresAt
		}
		g := &Grant{
			PublicID: uuid.New(), UserID: userID,
			EntitlementPlanID: code.Batch.EntitlementPlanID,
			SourceType:        SourceCard, SourceCardID: &code.ID,
			StartsAt: anchor, ExpiresAt: anchor.Add(time.Duration(code.Batch.DurationDays) * 24 * time.Hour),
			Plan: code.Plan,
		}
		if err := s.grants.CreateGrant(tctx, g); err != nil {
			return err
		}
		if err := s.batches.MarkCodeRedeemed(tctx, code.ID, userID, now); err != nil {
			return err
		}
		if s.audit != nil {
			_ = s.audit.Record(tctx, &userID, "entitlement.redeem", "card_code", code.CodeFingerprint, map[string]any{
				"grant_id":      g.PublicID.String(),
				"plan_code":     code.Plan.Code,
				"duration_days": code.Batch.DurationDays,
			})
		}
		grant = *g
		return nil
	})
	if err != nil {
		return Grant{}, EffectiveEntitlement{}, err
	}
	eff, err := s.GetEffective(ctx, userID)
	if err != nil {
		return grant, eff, err
	}
	return grant, eff, nil
}

// GrantByAdmin creates a grant without a card (admin console action).
func (s *Service) GrantByAdmin(ctx context.Context, adminID, userID, planID int64, period time.Duration) (Grant, error) {
	if adminID <= 0 || userID <= 0 || planID <= 0 || period <= 0 {
		return Grant{}, apperr.Validation(apperr.CodeConflict, "invalid entitlement grant")
	}
	now := s.now()
	var grant Grant
	err := s.tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := s.userLock.LockUserForUpdate(tctx, userID); err != nil {
			return err
		}
		plan, err := s.plans.GetPlanByID(tctx, planID)
		if err != nil {
			return err
		}
		if plan.Status != StatusActive {
			return apperr.Conflict(apperr.CodeConflict, "entitlement plan disabled")
		}
		var last *Grant
		if last, err = s.grants.GetLastNonRevokedGrant(tctx, userID); err != nil {
			if apperr.KindOf(err) != apperr.KindNotFound {
				return err
			}
			last = nil
		}
		if err := validatePlanRenewal(last, planID, now); err != nil {
			return err
		}
		anchor := now
		if last != nil && last.ExpiresAt.After(anchor) {
			anchor = last.ExpiresAt
		}
		g := &Grant{
			PublicID: uuid.New(), UserID: userID, EntitlementPlanID: planID,
			SourceType: SourceAdmin, StartsAt: anchor, ExpiresAt: anchor.Add(period), CreatedAt: now, Plan: plan,
		}
		if err := s.grants.CreateGrant(tctx, g); err != nil {
			return err
		}
		if s.audit != nil {
			if err := s.audit.Record(tctx, &adminID, "entitlement.grant_admin", "entitlement_grant", g.PublicID.String(), map[string]any{
				"plan_id": planID, "duration_seconds": int64(period / time.Second),
			}); err != nil {
				return err
			}
		}
		grant = *g
		return nil
	})
	return grant, err
}

// RevokeGrant revokes a grant (admin).
func (s *Service) RevokeGrant(ctx context.Context, adminID, grantID int64, reason string) error {
	if strings.TrimSpace(reason) == "" || len(reason) > 500 {
		return apperr.Validation(apperr.CodeConflict, "revoke reason is required")
	}
	return s.grants.RevokeGrant(ctx, grantID, adminID, reason)
}

func (s *Service) RevokeGrantByAdmin(ctx context.Context, adminID int64, publicID uuid.UUID, reason string) error {
	if adminID <= 0 || publicID == uuid.Nil {
		return apperr.Validation(apperr.CodeConflict, "invalid entitlement grant")
	}
	if strings.TrimSpace(reason) == "" || len(reason) > 500 {
		return apperr.Validation(apperr.CodeConflict, "revoke reason is required")
	}
	return s.grants.RevokeGrantByPublicID(ctx, adminID, publicID, reason)
}

// Authorize runs the entitlement gate (docs/13 §9). Specific quota gates live
// in entity services (they know their own counts); this checks plan/grant,
// feature, and — when counters are wired — account/task quotas.
func (s *Service) Authorize(ctx context.Context, req AuthorizationRequest) (AuthorizationDecision, error) {
	eff, err := s.GetEffective(ctx, req.UserID)
	if err != nil {
		return AuthorizationDecision{}, err
	}
	dec := AuthorizationDecision{ReasonCode: "ALLOWED", Entitlement: &eff}
	if !eff.Active {
		dec.Allowed, dec.ReasonCode = false, apperr.CodeEntitlementRequired
		return dec, nil
	}
	if eff.ExpiresAt != nil && !eff.ExpiresAt.After(s.now()) {
		dec.Allowed, dec.ReasonCode = false, apperr.CodeEntitlementExpired
		return dec, nil
	}
	if req.RequiredFeature != "" && !eff.Features[req.RequiredFeature] {
		dec.Allowed, dec.ReasonCode = false, apperr.CodeFeatureNotEntitled
		return dec, nil
	}
	switch req.Action {
	case ActionAccountBind:
		if s.counters != nil {
			n, _ := s.counters.CountAccountsOccupied(ctx, req.UserID)
			if n >= eff.AccountQuota {
				dec.Allowed, dec.ReasonCode = false, apperr.CodeAccountQuotaExceeded
				return dec, nil
			}
		}
	case ActionTaskCreate:
		if s.counters != nil {
			// The caller re-checks with its own count; here we only protect
			// when counters are available.
			n, _ := s.counters.CountTasks(ctx, req.UserID)
			if n >= eff.TaskQuota {
				dec.Allowed, dec.ReasonCode = false, apperr.CodeTaskQuotaExceeded
				return dec, nil
			}
		}
	}
	dec.Allowed = true
	return dec, nil
}

// ReserveDaily reserves one send slot atomically (docs/13 §10.3).
func (s *Service) ReserveDaily(ctx context.Context, userID int64, localDate string) error {
	eff, err := s.GetEffective(ctx, userID)
	if err != nil {
		return err
	}
	if !eff.Active {
		return apperr.New(apperr.CodeEntitlementRequired, apperr.KindQuota, "entitlement required")
	}
	ok, err := s.usage.ReserveDailySend(ctx, userID, localDate, eff.DailySendQuota)
	if err != nil {
		return err
	}
	if !ok {
		return apperr.New(apperr.CodeDailySendQuotaExceeded, apperr.KindQuota, "daily send quota exceeded")
	}
	return nil
}

func (s *Service) ReleaseDaily(ctx context.Context, userID int64, localDate string) error {
	return s.usage.ReleaseDailySend(ctx, userID, localDate)
}

func (s *Service) IncrSucceeded(ctx context.Context, userID int64, localDate string) error {
	return s.usage.IncrSucceeded(ctx, userID, localDate)
}

func (s *Service) IncrFailed(ctx context.Context, userID int64, localDate string) error {
	return s.usage.IncrFailed(ctx, userID, localDate)
}

// ConfirmCodeForTest is used by the seed cmd to hash a printed code back to a
// stored hash comparison.
func (s *Service) ConfirmCodeForTest(norm, hash []byte) bool {
	return subtle.ConstantTimeCompare(norm, hash) == 1
}

// ---- admin plan/batch management (docs/12 §4, §12) ----

func (s *Service) ListPlans(ctx context.Context) ([]*Plan, error) {
	return s.plans.ListPlans(ctx)
}

func (s *Service) GetPlanByPublicID(ctx context.Context, publicID uuid.UUID) (*Plan, error) {
	return s.plans.GetPlanByPublicID(ctx, publicID)
}

func (s *Service) ListBatchSummaries(ctx context.Context, limit int) ([]CardBatchSummary, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	return s.batches.ListSummaries(ctx, limit)
}

func (s *Service) GetBatchSummary(ctx context.Context, publicID uuid.UUID) (CardBatchSummary, error) {
	return s.batches.GetSummaryByPublicID(ctx, publicID)
}

func (s *Service) ListRedemptionSummaries(ctx context.Context, limit int) ([]RedemptionSummary, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	return s.grants.ListRedemptionSummaries(ctx, limit)
}

func (s *Service) ListUserGrantSummaries(ctx context.Context, userID int64, limit int) ([]RedemptionSummary, error) {
	if userID <= 0 {
		return nil, apperr.Validation(apperr.CodeConflict, "invalid user")
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	return s.grants.ListUserGrantSummaries(ctx, userID, limit)
}

func (s *Service) ListCardCodeSummaries(ctx context.Context, batchPublicID uuid.UUID, limit int) ([]CardCodeSummary, error) {
	if batchPublicID == uuid.Nil {
		return nil, apperr.Validation(apperr.CodeConflict, "invalid card batch")
	}
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	return s.batches.ListCodeSummaries(ctx, batchPublicID, limit)
}

func (s *Service) RevokeUnusedCodeByAdmin(ctx context.Context, actorID int64, batchPublicID uuid.UUID, codeID int64, reason string) error {
	if actorID <= 0 || batchPublicID == uuid.Nil || codeID <= 0 {
		return apperr.Validation(apperr.CodeConflict, "invalid card code")
	}
	if strings.TrimSpace(reason) == "" || len(reason) > 500 {
		return apperr.Validation(apperr.CodeConflict, "revoke reason is required")
	}
	return s.batches.RevokeUnusedCode(ctx, actorID, batchPublicID, codeID, reason)
}

func (s *Service) CreatePlan(ctx context.Context, p *Plan) (*Plan, error) {
	p.PublicID = uuid.New()
	p.CreatedAt, p.UpdatedAt = s.now(), s.now()
	if p.Status == "" {
		p.Status = StatusActive
	}
	if p.Features == nil {
		p.Features = map[string]bool{}
	}
	return p, s.plans.CreatePlan(ctx, p)
}

func (s *Service) CreatePlanByAdmin(ctx context.Context, actorID int64, p *Plan) (*Plan, error) {
	if actorID <= 0 {
		return nil, apperr.Validation(apperr.CodeConflict, "invalid admin actor")
	}
	created, err := s.CreatePlan(ctx, p)
	if err != nil {
		return nil, err
	}
	if s.audit == nil {
		return created, fmt.Errorf("entitlement: audit sink unavailable")
	}
	if err := s.audit.Record(ctx, &actorID, "entitlement.plan.create", "entitlement_plan", created.PublicID.String(), map[string]any{
		"plan_code": created.Code,
	}); err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) DisablePlanByAdmin(ctx context.Context, actorID int64, publicID uuid.UUID) error {
	if actorID <= 0 || publicID == uuid.Nil {
		return apperr.Validation(apperr.CodeConflict, "invalid entitlement plan")
	}
	return s.plans.DisablePlan(ctx, actorID, publicID)
}

// CreateBatchWithCodes creates a batch and its `quantity` DK1 card codes,
// returning the plaintext codes exactly once for export (docs/12 §12.3).
func (s *Service) CreateBatchWithCodes(ctx context.Context, b *CardBatch) ([]string, error) {
	if b.Quantity <= 0 || b.Quantity > 100000 {
		return nil, apperr.Validation(apperr.CodeConflict, "quantity out of range")
	}
	b.PublicID = uuid.New()
	b.CreatedAt, b.UpdatedAt = s.now(), s.now()
	if b.Status == "" {
		b.Status = StatusActive
	}
	if b.CodeVersion == 0 {
		b.CodeVersion = CardCodeVersion1
	}
	codes := make([]*CardCode, 0, b.Quantity)
	plain := make([]string, 0, b.Quantity)
	seen := map[string]bool{}
	for i := 0; i < b.Quantity; i++ {
		var code string
		var err error
		for {
			code, err = GenerateCode()
			if err != nil {
				return nil, err
			}
			norm, _ := NormalizeCode(code)
			if !seen[norm] {
				seen[norm] = true
				break
			}
		}
		norm, _ := NormalizeCode(code)
		hash := HashCode(s.pepper, norm)
		codes = append(codes, &CardCode{
			CodeHash: hash, CodeFingerprint: Fingerprint(hash), Status: "unused",
		})
		plain = append(plain, code)
	}
	err := s.tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := s.batches.CreateBatch(tctx, b); err != nil {
			return err
		}
		return s.batches.InsertCodes(tctx, b.ID, codes)
	})
	if err != nil {
		return nil, err
	}
	return plain, nil
}

func (s *Service) CreateBatchWithCodesByAdmin(ctx context.Context, actorID int64, b *CardBatch) ([]string, error) {
	if actorID <= 0 {
		return nil, apperr.Validation(apperr.CodeConflict, "invalid admin actor")
	}
	b.CreatedBy = actorID
	codes, err := s.CreateBatchWithCodes(ctx, b)
	if err != nil {
		return nil, err
	}
	if s.audit == nil {
		return codes, fmt.Errorf("entitlement: audit sink unavailable")
	}
	if err := s.audit.Record(ctx, &actorID, "entitlement.batch.create", "card_batch", b.PublicID.String(), map[string]any{
		"plan_id": b.EntitlementPlanID, "duration_days": b.DurationDays, "quantity": b.Quantity,
	}); err != nil {
		return codes, err
	}
	return codes, nil
}

func (s *Service) DisableBatchByAdmin(ctx context.Context, actorID int64, publicID uuid.UUID) error {
	if actorID <= 0 || publicID == uuid.Nil {
		return apperr.Validation(apperr.CodeConflict, "invalid card batch")
	}
	return s.batches.DisableBatch(ctx, actorID, publicID)
}

func validateCodeForRedeem(c *CardCode, now time.Time) *apperr.AppError {
	if c.Status != "unused" {
		return apperr.Conflict(apperr.CodeConflict, "card code already used")
	}
	if c.Batch == nil || c.Plan == nil {
		return apperr.Conflict(apperr.CodeConflict, "card batch missing plan")
	}
	if c.Batch.Status != StatusActive {
		return apperr.Conflict(apperr.CodeConflict, "card batch disabled")
	}
	if c.Plan.Status != StatusActive {
		return apperr.Conflict(apperr.CodeConflict, "entitlement plan disabled")
	}
	if c.Batch.RedeemBefore != nil && !now.Before(*c.Batch.RedeemBefore) {
		return apperr.Conflict(apperr.CodeConflict, "card code redeem window closed")
	}
	if c.Batch.RedeemNotBefore != nil && now.Before(*c.Batch.RedeemNotBefore) {
		return apperr.Conflict(apperr.CodeConflict, "card code not yet redeemable")
	}
	return nil
}

// validatePlanRenewal enforces the MVP rule from docs/03, docs/09 and docs/12:
// while a user has an unrevoked grant that is still active or scheduled, a
// different plan cannot be appended. Cross-plan upgrade/downgrade conversion
// remains a separate product policy and must not be inferred here.
func validatePlanRenewal(last *Grant, nextPlanID int64, now time.Time) *apperr.AppError {
	if last == nil || !last.ExpiresAt.After(now) || last.EntitlementPlanID == nextPlanID {
		return nil
	}
	return apperr.Conflict(apperr.CodeEntitlementPlanConflict, "entitlement plan conflict")
}

// TimeOf returns the current time from the service clock (helper).
func (s *Service) TimeOf() time.Time { return s.now() }

// EnsureLocalDateIsWellformed helps future send schedulers.
func EnsureLocalDateIsWellformed(date string) error {
	if _, err := time.Parse("2006-01-02", date); err != nil {
		return fmt.Errorf("entitlement: invalid local_date %q", date)
	}
	return nil
}
