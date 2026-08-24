package conversation

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
)

type platformArchiveJobCreator interface {
	CreateJob(context.Context, *job.Job) error
}

type platformArchiveTxManager interface {
	WithinTx(context.Context, func(context.Context) error) error
}

// PlatformArchiveJobPayload is the stable, non-secret outbox handoff. The
// worker still loads the account and session through its repositories.
type PlatformArchiveJobPayload struct {
	JobID                  string  `json:"job_id"`
	ConversationID         int64   `json:"conversation_id"`
	AccountID              int64   `json:"account_id"`
	PlatformUserID         *string `json:"platform_user_id,omitempty"`
	PlatformConversationID string  `json:"platform_conversation_id"`
	Archived               bool    `json:"archived"`
}

type PlatformArchiveService struct {
	repo   PlatformArchiveRepository
	tx     platformArchiveTxManager
	jobs   platformArchiveJobCreator
	outbox outbox.Outbox
	now    func() time.Time
}

func NewPlatformArchiveService(repo PlatformArchiveRepository, tx platformArchiveTxManager, jobs platformArchiveJobCreator, relay outbox.Outbox) *PlatformArchiveService {
	return &PlatformArchiveService{repo: repo, tx: tx, jobs: jobs, outbox: relay, now: time.Now}
}

// Request creates only the durable Job and outbox handoff. It never calls a
// Sidecar from the HTTP request and does not change the local archive index.
func (s *PlatformArchiveService) Request(ctx context.Context, userID int64, accountPublicID, conversationPublicID uuid.UUID, archived bool) (uuid.UUID, error) {
	if s == nil || s.repo == nil || s.tx == nil || s.jobs == nil || s.outbox == nil {
		return uuid.Nil, apperr.New(apperr.CodeInternal, apperr.KindInternal, "platform archive service is not configured")
	}
	if userID <= 0 || accountPublicID == uuid.Nil || conversationPublicID == uuid.Nil {
		return uuid.Nil, apperr.Validation(apperr.CodeConflict, "invalid platform archive scope")
	}
	target, err := s.repo.GetPlatformArchiveTargetOwned(ctx, userID, accountPublicID, conversationPublicID)
	if err != nil {
		return uuid.Nil, err
	}
	if target == nil || target.AccountID <= 0 || target.UserID != userID || target.PlatformConversationID == "" {
		return uuid.Nil, apperr.NotFound(apperr.CodeConversationNotFound, "platform conversation not found")
	}
	now := time.Now()
	if s.now != nil {
		now = s.now()
	}
	jobID := uuid.New()
	jobRow := &job.Job{
		PublicID: jobID, UserID: &target.UserID, AccountID: &target.AccountID,
		Type: "conversation.archive.browser", Status: job.StatusQueued, Cancelable: true, CreatedAt: now,
	}
	payload, err := json.Marshal(PlatformArchiveJobPayload{
		JobID: jobID.String(), ConversationID: target.ConversationID, AccountID: target.AccountID,
		PlatformUserID: target.PlatformUserID, PlatformConversationID: target.PlatformConversationID, Archived: archived,
	})
	if err != nil {
		return uuid.Nil, err
	}
	if err := s.tx.WithinTx(ctx, func(tctx context.Context) error {
		if err := s.jobs.CreateJob(tctx, jobRow); err != nil {
			return err
		}
		return s.outbox.Add(tctx, outbox.Message{
			Kind: outbox.KindConversationArchive, AggregateType: "job", AggregateID: jobID.String(),
			Payload: payload, DedupeKey: "job.platform:" + jobID.String(),
		})
	}); err != nil {
		return uuid.Nil, err
	}
	return jobID, nil
}
