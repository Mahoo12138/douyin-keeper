package account

import (
	"context"
	"encoding/json"
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

func (s *Service) GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*Account, error) {
	return s.repo.GetOwned(ctx, userID, publicID)
}

// CreateBinding starts a QR or SMS binding: quota-gated, the account is
// created in 'binding' state (occupies a slot), a generic job and an outbox
// message are written in the same tx (docs/14 §5). SMS phone input is carried
// only in the short-lived outbox handoff; it is never emitted as a job event.
func (s *Service) CreateBinding(ctx context.Context, userID int64, method, phone string) (uuid.UUID, error) {
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
		typ := "account.bind.qr"
		kind := outbox.KindAccountBindQR
		if method == "sms" {
			typ = "account.bind.sms"
			kind = outbox.KindAccountBindSMS
		}
		j := newPlatformJob(acct, typ, true, s.now())
		if err := s.jobs.CreateJob(tctx, j); err != nil {
			return err
		}
		payload := jobRefPayload(j.PublicID)
		if method == "sms" {
			payload = bindingJobPayload(j.PublicID, phone)
		}
		if err := s.outbox.Add(tctx, outbox.Message{
			Kind: kind, AggregateType: "account", AggregateID: acct.PublicID.String(),
			Payload: payload, DedupeKey: "account.binding:" + acct.PublicID.String(),
		}); err != nil {
			return err
		}
		jobPublicID = j.PublicID
		return nil
	})
	if err != nil {
		return uuid.Nil, err
	}
	return jobPublicID, nil
}

// RequestSessionCheck creates a generic job + outbox for worker-browser.
func (s *Service) RequestSessionCheck(ctx context.Context, userID int64, publicID uuid.UUID) (uuid.UUID, error) {
	acct, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return uuid.Nil, err
	}
	if acct.BindingStatus != BindingBound {
		return uuid.Nil, apperr.Conflict(apperr.CodeConflict, "account is not bound")
	}
	return s.createPlatformJob(ctx, acct, "account.session_check.browser",
		outbox.KindSessionCheckBrowser, false)
}

// RequestFriendsSync is entitlement-gated (docs/06: friends sync is a gated
// entry point).
func (s *Service) RequestFriendsSync(ctx context.Context, userID int64, publicID uuid.UUID) (uuid.UUID, error) {
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
	return s.createPlatformJob(ctx, acct, "account.friends_sync.browser",
		outbox.KindFriendsSyncBrowser, false)
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
		return s.repo.SoftDelete(tctx, acct.ID)
	})
}

// createPlatformJob writes a generic job + outbox relay inside one tx.
func (s *Service) createPlatformJob(ctx context.Context, acct *Account, typ string, kind string, cancelable bool) (uuid.UUID, error) {
	var jobPublicID uuid.UUID
	err := s.tx.WithinTx(ctx, func(tctx context.Context) error {
		j := newPlatformJob(acct, typ, cancelable, s.now())
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
