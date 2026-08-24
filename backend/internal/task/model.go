// Package task owns SparkTask — one per (account, friend), a daily window and
// an optional sticker (docs/09 §6). It never ticks; the scheduler does.
package task

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
)

type SparkTask struct {
	ID                int64
	PublicID          uuid.UUID
	UserID            int64
	AccountID         int64
	FriendID          int64
	Enabled           bool
	Timezone          string
	WindowStart       string // HH:MM:SS
	WindowEnd         string // HH:MM:SS
	MessageKind       string // text | sticker
	MessageBody       *string
	AllowFirstMessage bool
	CreatedAt         time.Time
	UpdatedAt         time.Time
	DeletedAt         *time.Time

	// Joined for API responses (repo fills them).
	AccountPublicID uuid.UUID
	FriendPublicID  uuid.UUID
}

// CreateInput is the handler-facing payload for POST /tasks.
type CreateInput struct {
	AccountPublicID   uuid.UUID
	FriendPublicID    uuid.UUID
	Timezone          string
	WindowStart       string
	WindowEnd         string
	MessageKind       string
	MessageBody       *string
	Enabled           bool
	AllowFirstMessage bool
}

// TaskPatch merges optional fields from PATCH /tasks/:id.
type TaskPatch struct {
	Enabled           *bool
	Timezone          *string
	WindowStart       *string
	WindowEnd         *string
	MessageKind       *string
	MessageBody       *string
	AllowFirstMessage *bool
}

// ValidWindow enforces window_start < window_end (docs/09 §6, no midnight wrap).
func (t *SparkTask) ValidWindow() bool {
	return isTimeSpec(t.WindowStart) && isTimeSpec(t.WindowEnd) && t.WindowStart < t.WindowEnd
}

func isTimeSpec(s string) bool {
	if s == "" {
		return false
	}
	_, err := time.Parse("15:04:05", s)
	return err == nil
}

// ValidMessage enforces the text-task body requirement (docs/09 §6).
func (t *SparkTask) ValidMessage() bool {
	switch t.MessageKind {
	case "text":
		return t.MessageBody != nil && strings.TrimSpace(*t.MessageBody) != ""
	case "sticker":
		return true
	default:
		return false
	}
}

// ValidTimezone prevents an invalid IANA zone from making the scheduler's
// PostgreSQL local-time query fail for the whole tick.
func (t *SparkTask) ValidTimezone() bool {
	if t.Timezone == "" {
		return false
	}
	_, err := time.LoadLocation(t.Timezone)
	return err == nil
}

// Repository is implemented by infra/postgres.
type Repository interface {
	ListByUser(ctx context.Context, userID int64) ([]*SparkTask, error)
	GetByID(ctx context.Context, taskID int64) (*SparkTask, error)
	GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*SparkTask, error)
	Create(ctx context.Context, t *SparkTask) error
	Update(ctx context.Context, t *SparkTask) error
	SoftDelete(ctx context.Context, id int64) error
	CountTasks(ctx context.Context, userID int64) (int, error)
}

// DueRepository is the scheduler-facing read slice. The database query
// applies the account/friend gates that are safe to evaluate without a
// platform call; entitlement is checked again in the scheduler transaction.
type DueRepository interface {
	ListDue(ctx context.Context, now time.Time, limit int) ([]*SparkTask, error)
}

// AccountLookup / FriendLookup give the task service ownership checks without
// depending on their repositories (docs/14 §4).
type AccountLookup interface {
	GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*account.Account, error)
}

type FriendLookup interface {
	GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*friend.Friend, error)
}

type Gate interface {
	Authorize(ctx context.Context, req entitlement.AuthorizationRequest) (entitlement.AuthorizationDecision, error)
}

type UserLocker interface {
	LockUserForUpdate(ctx context.Context, userID int64) error
}

type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}

type Service struct {
	repo     Repository
	accounts AccountLookup
	friends  FriendLookup
	gate     Gate
	userLock UserLocker
	tx       TxManager
	now      func() time.Time
}

func NewService(repo Repository, accounts AccountLookup, friends FriendLookup,
	gate Gate, userLock UserLocker, tx TxManager) *Service {
	return &Service{repo: repo, accounts: accounts, friends: friends,
		gate: gate, userLock: userLock, tx: tx, now: time.Now}
}

func (s *Service) ListForUser(ctx context.Context, userID int64) ([]*SparkTask, error) {
	return s.repo.ListByUser(ctx, userID)
}

func (s *Service) GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*SparkTask, error) {
	return s.repo.GetOwned(ctx, userID, publicID)
}

// Create validates ownership, friend identity, the window and the task quota,
// then inserts. Everything gated + counted inside one tx (docs/14 §5).
func (s *Service) Create(ctx context.Context, userID int64, in CreateInput) (*SparkTask, error) {
	probe := &SparkTask{WindowStart: in.WindowStart, WindowEnd: in.WindowEnd,
		MessageKind: in.MessageKind, MessageBody: in.MessageBody}
	if !probe.ValidWindow() {
		return nil, apperr.Validation(apperr.CodeConflict, "window_start must be before window_end (HH:MM:SS)")
	}
	probe.Timezone = in.Timezone
	if probe.Timezone == "" {
		probe.Timezone = "Asia/Shanghai"
	}
	if !probe.ValidTimezone() {
		return nil, apperr.Validation(apperr.CodeConflict, "timezone must be a valid IANA timezone")
	}
	if !probe.ValidMessage() {
		return nil, apperr.Validation(apperr.CodeConflict, "text tasks require a message body")
	}
	dec, err := s.gate.Authorize(ctx, entitlement.AuthorizationRequest{
		UserID: userID, Action: entitlement.ActionTaskCreate,
	})
	if err != nil {
		return nil, err
	}
	if !dec.Allowed {
		return nil, quotaGateErr(dec.ReasonCode)
	}

	var t *SparkTask
	err = s.tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := s.userLock.LockUserForUpdate(tctx, userID); err != nil {
			return err
		}
		acct, err := s.accounts.GetOwned(tctx, userID, in.AccountPublicID)
		if err != nil {
			return err
		}
		if acct.BindingStatus != account.BindingBound {
			return apperr.Conflict(apperr.CodeConflict, "account is not bound")
		}
		f, err := s.friends.GetOwned(tctx, userID, in.FriendPublicID)
		if err != nil {
			return err
		}
		if !f.Resolved() {
			return apperr.Conflict(apperr.CodeFriendIdentityUnsolid, "friend identity is not resolved")
		}
		n, err := s.repo.CountTasks(tctx, userID)
		if err != nil {
			return err
		}
		if dec.Entitlement != nil && n >= dec.Entitlement.TaskQuota {
			return apperr.New(apperr.CodeTaskQuotaExceeded, apperr.KindQuota, "task quota exceeded")
		}
		now := s.now()
		tz := in.Timezone
		if tz == "" {
			tz = "Asia/Shanghai"
		}
		t = &SparkTask{
			PublicID: uuid.New(), UserID: userID, AccountID: acct.ID, FriendID: f.ID,
			Enabled: in.Enabled, Timezone: tz, WindowStart: in.WindowStart, WindowEnd: in.WindowEnd,
			MessageKind: in.MessageKind, MessageBody: in.MessageBody,
			AllowFirstMessage: in.AllowFirstMessage, CreatedAt: now, UpdatedAt: now,
		}
		return s.repo.Create(tctx, t)
	})
	if err != nil {
		return nil, err
	}
	return t, nil
}

// Update applies the patch on top of the owned task.
func (s *Service) Update(ctx context.Context, userID int64, publicID uuid.UUID, p TaskPatch) (*SparkTask, error) {
	existing, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return nil, err
	}
	applyPatch(existing, p)
	if !existing.ValidWindow() {
		return nil, apperr.Validation(apperr.CodeConflict, "window_start must be before window_end (HH:MM:SS)")
	}
	if !existing.ValidTimezone() {
		return nil, apperr.Validation(apperr.CodeConflict, "timezone must be a valid IANA timezone")
	}
	if !existing.ValidMessage() {
		return nil, apperr.Validation(apperr.CodeConflict, "text tasks require a message body")
	}
	existing.UpdatedAt = s.now()
	if err := s.repo.Update(ctx, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

func (s *Service) Delete(ctx context.Context, userID int64, publicID uuid.UUID) error {
	t, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return err
	}
	return s.repo.SoftDelete(ctx, t.ID)
}

func applyPatch(t *SparkTask, p TaskPatch) {
	if p.Enabled != nil {
		t.Enabled = *p.Enabled
	}
	if p.Timezone != nil {
		t.Timezone = *p.Timezone
	}
	if p.WindowStart != nil {
		t.WindowStart = *p.WindowStart
	}
	if p.WindowEnd != nil {
		t.WindowEnd = *p.WindowEnd
	}
	if p.MessageKind != nil {
		t.MessageKind = *p.MessageKind
	}
	if p.MessageBody != nil {
		t.MessageBody = p.MessageBody
	}
	if p.AllowFirstMessage != nil {
		t.AllowFirstMessage = *p.AllowFirstMessage
	}
}

func quotaGateErr(reason string) error {
	switch reason {
	case apperr.CodeEntitlementRequired, apperr.CodeEntitlementExpired, apperr.CodeFeatureNotEntitled:
		return apperr.New(reason, apperr.KindForbidden, "entitlement does not allow this action")
	default:
		return apperr.New(apperr.CodeTaskQuotaExceeded, apperr.KindQuota, "task quota exceeded")
	}
}
