package account

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
)

// Gate is the entitlement Authorize slice used by resource services.
type Gate interface {
	Authorize(ctx context.Context, req entitlement.AuthorizationRequest) (entitlement.AuthorizationDecision, error)
}

// UserLocker serializes per-user resource creation (docs/13 §10.1).
type UserLocker interface {
	LockUserForUpdate(ctx context.Context, userID int64) error
}

// JobCreator appends a generic job row; implemented by infra/postgres.
type JobCreator interface {
	CreateJob(ctx context.Context, j *job.Job) error
}

type IdempotentJobCreator interface {
	JobCreator
	GetByIdempotency(ctx context.Context, userID int64, key string) (*job.Job, error)
}

// TxManager mirrors infra/postgres slice.
type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}

type Service struct {
	repo     Repository
	tx       TxManager
	gate     Gate
	userLock UserLocker
	jobs     JobCreator
	outbox   outbox.Outbox
	now      func() time.Time
}

func NewService(repo Repository, tx TxManager, gate Gate, userLock UserLocker,
	jobs JobCreator, outbox outbox.Outbox) *Service {
	return &Service{repo: repo, tx: tx, gate: gate, userLock: userLock,
		jobs: jobs, outbox: outbox, now: time.Now}
}

func (s *Service) ListOwned(ctx context.Context, userID int64) ([]*Account, error) {
	return s.repo.ListOwned(ctx, userID)
}

func (s *Service) ListOwnedSummary(ctx context.Context, userID int64) ([]*Summary, error) {
	if repo, ok := s.repo.(SummaryRepository); ok {
		return repo.ListOwnedSummary(ctx, userID)
	}
	accounts, err := s.repo.ListOwned(ctx, userID)
	if err != nil {
		return nil, err
	}
	summaries := make([]*Summary, 0, len(accounts))
	for _, item := range accounts {
		if item == nil {
			continue
		}
		summaries = append(summaries, &Summary{Account: *item})
	}
	return summaries, nil
}

func (s *Service) ListOwnedSummaryPage(ctx context.Context, userID int64, filter SummaryListFilter) (SummaryListPage, error) {
	filter = normalizeSummaryListFilter(filter)
	if repo, ok := s.repo.(SummaryPageRepository); ok {
		items, err := repo.ListOwnedSummaryPage(ctx, userID, filter)
		if err != nil {
			return SummaryListPage{}, err
		}
		return trimSummaryListPage(items, filter.Limit), nil
	}
	items, err := s.ListOwnedSummary(ctx, userID)
	if err != nil {
		return SummaryListPage{}, err
	}
	if filter.AfterID > 0 {
		start := len(items)
		for index, item := range items {
			if item != nil && item.Account.ID < filter.AfterID {
				start = index
				break
			}
		}
		if start < len(items) {
			items = items[start:]
		} else {
			items = nil
		}
	}
	return trimSummaryListPage(items, filter.Limit), nil
}

func normalizeSummaryListFilter(filter SummaryListFilter) SummaryListFilter {
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 100 {
		filter.Limit = 100
	}
	if filter.AfterID < 0 {
		filter.AfterID = 0
	}
	return filter
}

func trimSummaryListPage(items []*Summary, limit int) SummaryListPage {
	page := SummaryListPage{Items: items}
	if len(items) <= limit {
		return page
	}
	page.Items = items[:limit]
	if last := page.Items[len(page.Items)-1]; last != nil && last.Account.ID > 0 {
		page.NextAfterID = last.Account.ID
	}
	return page
}

func (s *Service) GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*Account, error) {
	return s.repo.GetOwned(ctx, userID, publicID)
}

// CreateBinding starts a QR or SMS binding: quota-gated, the account is
// created in 'binding' state (occupies a slot), a generic job and an outbox
// message are written in the same tx (docs/14 §5). SMS phone input is carried
// only in the short-lived outbox handoff; it is never emitted as a job event.
func (s *Service) CreateBinding(ctx context.Context, userID int64, method, phone string) (uuid.UUID, error) {
	return s.createBinding(ctx, userID, method, phone, "")
}

func (s *Service) CreateBindingWithKey(ctx context.Context, userID int64, method, phone, idempotencyKey string) (uuid.UUID, error) {
	return s.createBinding(ctx, userID, method, phone, idempotencyKey)
}

func (s *Service) createBinding(ctx context.Context, userID int64, method, phone, idempotencyKey string) (uuid.UUID, error) {
	idempotent, idempotencyKey, err := s.idempotentJobs(userID, idempotencyKey)
	if err != nil {
		return uuid.Nil, err
	}
	scope := "account.binding:" + method
	if idempotent != nil {
		existing, lookupErr := idempotent.GetByIdempotency(ctx, userID, idempotencyKey)
		if lookupErr != nil {
			return uuid.Nil, lookupErr
		}
		if existing != nil {
			return resolveIdempotentJob(existing, scope)
		}
	}
	dec, err := s.gate.Authorize(ctx, entitlement.AuthorizationRequest{
		UserID: userID, Action: entitlement.ActionAccountBind,
	})
	if err != nil {
		return uuid.Nil, err
	}
	if !dec.Allowed {
		return uuid.Nil, gateErr(dec.ReasonCode)
	}
	var jobPublicID uuid.UUID
	err = s.tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := s.userLock.LockUserForUpdate(tctx, userID); err != nil {
			return err
		}
		n, err := s.repo.CountQuotaOccupied(tctx, userID)
		if err != nil {
			return err
		}
		if dec.Entitlement != nil && n >= dec.Entitlement.AccountQuota {
			return apperr.New(apperr.CodeAccountQuotaExceeded, apperr.KindQuota, "account quota exceeded")
		}
		acct := &Account{
			PublicID: uuid.New(), UserID: userID, BindingStatus: BindingBinding,
			SessionStatus: SessionUnknown, RiskStatus: RiskNormal,
			CreatedAt: s.now(), UpdatedAt: s.now(),
		}
		if err := s.repo.Create(tctx, acct); err != nil {
			return err
		}
		jobPublicID, err = s.createBindingJob(tctx, acct, method, phone, false, "account.binding:"+acct.PublicID.String(), idempotencyKey, scope)
		return err
	})
	if err != nil {
		if idempotent != nil && errors.Is(err, job.ErrIdempotencyConflict) {
			existing, lookupErr := idempotent.GetByIdempotency(ctx, userID, idempotencyKey)
			if lookupErr != nil {
				return uuid.Nil, lookupErr
			}
			return resolveIdempotentJob(existing, scope)
		}
		return uuid.Nil, err
	}
	return jobPublicID, nil
}

// Rebind starts a login flow for an already-owned account. It reuses the
// existing account row and session replacement transaction; it never creates
// another quota-consuming account. A failed re-login leaves the current
// session and account identity untouched.
func (s *Service) Rebind(ctx context.Context, userID int64, publicID uuid.UUID, method, phone string) (uuid.UUID, error) {
	return s.rebind(ctx, userID, publicID, method, phone, "")
}

func (s *Service) RebindWithKey(ctx context.Context, userID int64, publicID uuid.UUID, method, phone, idempotencyKey string) (uuid.UUID, error) {
	return s.rebind(ctx, userID, publicID, method, phone, idempotencyKey)
}

func (s *Service) rebind(ctx context.Context, userID int64, publicID uuid.UUID, method, phone, idempotencyKey string) (uuid.UUID, error) {
	idempotent, idempotencyKey, err := s.idempotentJobs(userID, idempotencyKey)
	if err != nil {
		return uuid.Nil, err
	}
	scope := fmt.Sprintf("account.relogin:%s:%s", publicID, method)
	if idempotent != nil {
		existing, lookupErr := idempotent.GetByIdempotency(ctx, userID, idempotencyKey)
		if lookupErr != nil {
			return uuid.Nil, lookupErr
		}
		if existing != nil {
			return resolveIdempotentJob(existing, scope)
		}
	}
	var acct *Account
	var jobPublicID uuid.UUID
	err = s.tx.WithinTx(ctx, func(tctx context.Context) error {
		if s.userLock != nil {
			if err := s.userLock.LockUserForUpdate(tctx, userID); err != nil {
				return err
			}
		}
		var err error
		acct, err = s.repo.GetOwned(tctx, userID, publicID)
		if err != nil {
			return err
		}
		if acct.BindingStatus != BindingBound {
			return apperr.Conflict(apperr.CodeConflict, "account is not bound")
		}
		jobPublicID, err = s.createBindingJob(tctx, acct, method, phone, true,
			"account.rebinding:"+acct.PublicID.String()+":"+uuid.New().String(), idempotencyKey, scope)
		return err
	})
	if err != nil {
		if idempotent != nil && errors.Is(err, job.ErrIdempotencyConflict) {
			existing, lookupErr := idempotent.GetByIdempotency(ctx, userID, idempotencyKey)
			if lookupErr != nil {
				return uuid.Nil, lookupErr
			}
			return resolveIdempotentJob(existing, scope)
		}
		return uuid.Nil, err
	}
	return jobPublicID, nil
}

func (s *Service) createBindingJob(ctx context.Context, acct *Account, method, phone string, rebind bool, dedupeKey, idempotencyKey, idempotencyScope string) (uuid.UUID, error) {
	typ := "account.bind.qr"
	kind := outbox.KindAccountBindQR
	if rebind {
		typ = "account.relogin.qr"
	}
	if method == "sms" {
		typ = "account.bind.sms"
		kind = outbox.KindAccountBindSMS
		if rebind {
			typ = "account.relogin.sms"
		}
	}
	j := newPlatformJob(acct, typ, true, s.now())
	if idempotencyKey != "" {
		j.IdempotencyKey = &idempotencyKey
		j.IdempotencyScope = &idempotencyScope
	}
	if err := s.jobs.CreateJob(ctx, j); err != nil {
		return uuid.Nil, err
	}
	payload := jobRefPayload(j.PublicID)
	if method == "sms" {
		payload = bindingJobPayload(j.PublicID, phone)
	}
	if err := s.outbox.Add(ctx, outbox.Message{
		Kind: kind, AggregateType: "account", AggregateID: acct.PublicID.String(),
		Payload: payload, DedupeKey: dedupeKey,
	}); err != nil {
		return uuid.Nil, err
	}
	return j.PublicID, nil
}

func (s *Service) idempotentJobs(userID int64, idempotencyKey string) (IdempotentJobCreator, string, error) {
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	if idempotencyKey == "" {
		return nil, "", nil
	}
	if _, err := uuid.Parse(idempotencyKey); err != nil {
		return nil, "", apperr.Validation(apperr.CodeConflict, "a valid Idempotency-Key is required")
	}
	idempotent, ok := s.jobs.(IdempotentJobCreator)
	if !ok {
		return nil, "", apperr.New(apperr.CodeInternal, apperr.KindInternal, "idempotent job storage is not configured")
	}
	return idempotent, idempotencyKey, nil
}

func resolveIdempotentJob(existing *job.Job, scope string) (uuid.UUID, error) {
	if existing == nil {
		return uuid.Nil, nil
	}
	if existing.IdempotencyScope == nil || *existing.IdempotencyScope != scope {
		return uuid.Nil, apperr.Conflict(apperr.CodeConflict, "Idempotency-Key was already used for another account operation")
	}
	return existing.PublicID, nil
}

// RequestSessionCheck creates a generic job + outbox for worker-browser.
func (s *Service) RequestSessionCheck(ctx context.Context, userID int64, publicID uuid.UUID) (uuid.UUID, error) {
	return s.requestSessionCheck(ctx, userID, publicID, "")
}

func (s *Service) RequestSessionCheckWithKey(ctx context.Context, userID int64, publicID uuid.UUID, idempotencyKey string) (uuid.UUID, error) {
	return s.requestSessionCheck(ctx, userID, publicID, idempotencyKey)
}

func (s *Service) requestSessionCheck(ctx context.Context, userID int64, publicID uuid.UUID, idempotencyKey string) (uuid.UUID, error) {
	acct, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return uuid.Nil, err
	}
	if acct.BindingStatus != BindingBound {
		return uuid.Nil, apperr.Conflict(apperr.CodeConflict, "account is not bound")
	}
	return s.createPlatformJob(ctx, acct, "account.session_check.browser",
		outbox.KindSessionCheckBrowser, false, idempotencyKey)
}

// RequestFriendsSync is kept as a compatibility entry point for older clients.
// The implementation now schedules the unified message-panel conversation
// sync; the follower/friend crawler is no longer part of the product flow.
func (s *Service) RequestFriendsSync(ctx context.Context, userID int64, publicID uuid.UUID) (uuid.UUID, error) {
	return s.requestFriendsSync(ctx, userID, publicID, "")
}

func (s *Service) RequestFriendsSyncWithKey(ctx context.Context, userID int64, publicID uuid.UUID, idempotencyKey string) (uuid.UUID, error) {
	return s.requestFriendsSync(ctx, userID, publicID, idempotencyKey)
}

func (s *Service) requestFriendsSync(ctx context.Context, userID int64, publicID uuid.UUID, idempotencyKey string) (uuid.UUID, error) {
	return s.requestConversationsSync(ctx, userID, publicID, idempotencyKey)
}

// RequestConversationsSync starts an account-scoped conversation crawl. It
// uses the same entitlement gate as friend sync because both are read-only
// platform indexing operations for the bound account.
func (s *Service) RequestConversationsSync(ctx context.Context, userID int64, publicID uuid.UUID) (uuid.UUID, error) {
	return s.requestConversationsSync(ctx, userID, publicID, "")
}

func (s *Service) RequestConversationsSyncWithKey(ctx context.Context, userID int64, publicID uuid.UUID, idempotencyKey string) (uuid.UUID, error) {
	return s.requestConversationsSync(ctx, userID, publicID, idempotencyKey)
}

func (s *Service) requestConversationsSync(ctx context.Context, userID int64, publicID uuid.UUID, idempotencyKey string) (uuid.UUID, error) {
	acct, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return uuid.Nil, err
	}
	if acct.BindingStatus != BindingBound {
		return uuid.Nil, apperr.Conflict(apperr.CodeConflict, "account is not bound")
	}
	dec, err := s.gate.Authorize(ctx, entitlement.AuthorizationRequest{
		UserID: userID, Action: entitlement.ActionFriendsSync,
	})
	if err != nil {
		return uuid.Nil, err
	}
	if !dec.Allowed {
		return uuid.Nil, gateErr(dec.ReasonCode)
	}
	return s.createPlatformJob(ctx, acct, "account.conversations_sync.browser",
		outbox.KindConversationsSyncBrowser, false, idempotencyKey)
}

// Pause defers all future automated work for the account (risk / user choice).
func (s *Service) Pause(ctx context.Context, userID int64, publicID uuid.UUID) error {
	acct, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return err
	}
	return s.repo.SetPaused(ctx, acct.ID, timePtr(s.now()))
}

func (s *Service) Resume(ctx context.Context, userID int64, publicID uuid.UUID) error {
	acct, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return err
	}
	now := s.now()
	if acct.RiskStatus == RiskCoolingDown && (acct.CooldownUntil == nil || now.Before(*acct.CooldownUntil)) {
		return apperr.Conflict(apperr.CodeAccountCooldownActive, "account cooldown is still active")
	}
	return s.repo.SetPaused(ctx, acct.ID, nil)
}

// Release soft-deletes the account and marks the slot free (docs/13 §12).
func (s *Service) Release(ctx context.Context, userID int64, publicID uuid.UUID) error {
	acct, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return err
	}
	return s.tx.WithinTx(ctx, func(tctx context.Context) error {
		if s.userLock != nil {
			if err := s.userLock.LockUserForUpdate(tctx, userID); err != nil {
				return err
			}
		}
		return s.repo.SoftDelete(tctx, acct.ID)
	})
}

// createPlatformJob writes a generic job + outbox relay inside one tx.
func (s *Service) createPlatformJob(ctx context.Context, acct *Account, typ string, kind string, cancelable bool, idempotencyKey string) (uuid.UUID, error) {
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	var idempotent IdempotentJobCreator
	if idempotencyKey != "" {
		if _, err := uuid.Parse(idempotencyKey); err != nil {
			return uuid.Nil, apperr.Validation(apperr.CodeConflict, "a valid Idempotency-Key is required")
		}
		var ok bool
		idempotent, ok = s.jobs.(IdempotentJobCreator)
		if !ok {
			return uuid.Nil, apperr.New(apperr.CodeInternal, apperr.KindInternal, "idempotent job storage is not configured")
		}
	}
	scope := fmt.Sprintf("%s:%s", typ, acct.PublicID)
	resolveExisting := func(existing *job.Job) (uuid.UUID, error) {
		if existing == nil {
			return uuid.Nil, nil
		}
		if existing.IdempotencyScope == nil || *existing.IdempotencyScope != scope {
			return uuid.Nil, apperr.Conflict(apperr.CodeConflict, "Idempotency-Key was already used for another account operation")
		}
		return existing.PublicID, nil
	}
	if idempotent != nil {
		existing, err := idempotent.GetByIdempotency(ctx, acct.UserID, idempotencyKey)
		if err != nil {
			return uuid.Nil, err
		}
		if existing != nil {
			return resolveExisting(existing)
		}
	}
	var jobPublicID uuid.UUID
	err := s.tx.WithinTx(ctx, func(tctx context.Context) error {
		j := newPlatformJob(acct, typ, cancelable, s.now())
		if idempotencyKey != "" {
			j.IdempotencyKey = &idempotencyKey
			j.IdempotencyScope = &scope
		}
		if err := s.jobs.CreateJob(tctx, j); err != nil {
			return err
		}
		if err := s.outbox.Add(tctx, outbox.Message{
			Kind: kind, AggregateType: "job", AggregateID: j.PublicID.String(),
			Payload: jobRefPayload(j.PublicID), DedupeKey: "job.platform:" + j.PublicID.String(),
		}); err != nil {
			return err
		}
		jobPublicID = j.PublicID
		return nil
	})
	if err != nil {
		if idempotent != nil && errors.Is(err, job.ErrIdempotencyConflict) {
			existing, lookupErr := idempotent.GetByIdempotency(ctx, acct.UserID, idempotencyKey)
			if lookupErr != nil {
				return uuid.Nil, lookupErr
			}
			return resolveExisting(existing)
		}
		return uuid.Nil, err
	}
	return jobPublicID, nil
}

func newPlatformJob(acct *Account, typ string, cancelable bool, now time.Time) *job.Job {
	userID := acct.UserID
	return &job.Job{
		PublicID: uuid.New(), UserID: &userID, AccountID: &acct.ID,
		Type: typ, Status: job.StatusQueued, Cancelable: cancelable, CreatedAt: now,
	}
}

func jobRefPayload(jobPublicID uuid.UUID) json.RawMessage {
	b, _ := json.Marshal(map[string]string{"job_id": jobPublicID.String()})
	return b
}

func bindingJobPayload(jobPublicID uuid.UUID, phone string) json.RawMessage {
	b, _ := json.Marshal(map[string]string{"job_id": jobPublicID.String(), "phone": phone})
	return b
}

func gateErr(reason string) error {
	switch reason {
	case apperr.CodeEntitlementRequired, apperr.CodeEntitlementExpired, apperr.CodeFeatureNotEntitled:
		return apperr.New(reason, apperr.KindForbidden, "entitlement does not allow this action")
	case apperr.CodeAccountQuotaExceeded, apperr.CodeTaskQuotaExceeded, apperr.CodeDailySendQuotaExceeded:
		return apperr.New(reason, apperr.KindQuota, "quota exceeded")
	default:
		return apperr.New(apperr.CodeForbidden, apperr.KindForbidden, "action not allowed")
	}
}

func timePtr(t time.Time) *time.Time { return &t }
