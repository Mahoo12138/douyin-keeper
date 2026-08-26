package send

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

// TaskLookup resolves the task a run-now refers to.
type TaskLookup interface {
	GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*task.SparkTask, error)
}

type Gate interface {
	Authorize(ctx context.Context, req entitlement.AuthorizationRequest) (entitlement.AuthorizationDecision, error)
}

// QuotaBox exposes the daily-send reservation slice of the entitlement
// service. Called inside the intent tx so reserve and insert commit together
// (docs/15 §3.2).
type QuotaBox interface {
	ReserveDaily(ctx context.Context, userID int64, localDate string) error
	ReleaseDaily(ctx context.Context, userID int64, localDate string) error
}

type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}

type Service struct {
	repo   Repository
	tasks  TaskLookup
	gate   Gate
	quota  QuotaBox
	outbox outbox.Outbox
	tx     TxManager
	now    func() time.Time
}

func NewService(repo Repository, tasks TaskLookup, gate Gate, quota QuotaBox,
	outbox outbox.Outbox, tx TxManager) *Service {
	return &Service{repo: repo, tasks: tasks, gate: gate, quota: quota,
		outbox: outbox, tx: tx, now: time.Now}
}

// RunNow creates a manual intent + first job + outbox relay (docs/15 §4). The
// unique request_id dedupes repeated user clicks.
func (s *Service) RunNow(ctx context.Context, userID int64, taskPublicID uuid.UUID) (*SendIntent, *SendJob, error) {
	dec, err := s.gate.Authorize(ctx, entitlement.AuthorizationRequest{
		UserID: userID, Action: entitlement.ActionSendExecute,
	})
	if err != nil {
		return nil, nil, err
	}
	if !dec.Allowed {
		return nil, nil, sendGateErr(dec.ReasonCode)
	}
	now := s.now()
	requestID := uuid.New()

	var intent *SendIntent
	var job *SendJob
	err = s.tx.WithinTx(ctx, func(tctx context.Context) error {
		tk, err := s.tasks.GetOwned(tctx, userID, taskPublicID)
		if err != nil {
			return err
		}

		date := entitlement.EffectiveLocalDate(now)
		if err := s.quota.ReserveDaily(tctx, userID, date); err != nil {
			return err
		}

		in := &SendIntent{
			PublicID: uuid.New(), IntentType: IntentManual, RequestID: &requestID,
			TaskID: &tk.ID, AccountID: tk.AccountID, FriendID: tk.FriendID,
			LocalDate: &date, ScheduledAt: now, Status: IntentQueued, CreatedAt: now, UpdatedAt: now,
			MessageKind: snapshotStringPtr(tk.MessageKind), MessageBody: tk.MessageBody,
		}
		if err := s.repo.CreateIntent(tctx, in); err != nil {
			return err
		}
		j := &SendJob{
			PublicID: uuid.New(), IntentID: in.ID, AccountID: tk.AccountID, FriendID: tk.FriendID,
			Attempt: 1, Status: JobQueued, CreatedAt: now,
		}
		if err := s.repo.CreateJob(tctx, j); err != nil {
			return err
		}
		if err := s.repo.SetIntentLastJob(tctx, in.ID, j.ID); err != nil {
			return err
		}
		payload := map[string]string{"intent_id": in.PublicID.String(), "job_id": j.PublicID.String()}
		if err := s.outbox.Add(tctx, outbox.Message{
			Kind: outbox.KindSendDispatch, AggregateType: "send_intent",
			AggregateID: in.PublicID.String(), Payload: jsonOf(payload),
			DedupeKey: "send.dispatch:" + in.PublicID.String(),
		}); err != nil {
			return err
		}
		intent, job = in, j
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	return intent, job, nil
}

func snapshotStringPtr(value string) *string { return &value }

// ListIntents returns the user's send history (newest first).
func (s *Service) ListIntents(ctx context.Context, userID int64, filter IntentListFilter) ([]*SendIntent, error) {
	return s.repo.ListIntentsByUser(ctx, userID, filter)
}

func (s *Service) ListIntentsPage(ctx context.Context, userID int64, filter IntentListFilter) (IntentListPage, error) {
	filter = normalizeIntentListFilter(filter)
	if repo, ok := s.repo.(PageRepository); ok {
		items, err := repo.ListIntentsByUserPage(ctx, userID, filter)
		if err != nil {
			return IntentListPage{}, err
		}
		return trimIntentListPage(items, filter.Limit), nil
	}
	items, err := s.repo.ListIntentsByUser(ctx, userID, filter)
	if err != nil {
		return IntentListPage{}, err
	}
	if filter.AfterID > 0 {
		start := len(items)
		for index, item := range items {
			if item != nil && item.ID < filter.AfterID {
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
	return trimIntentListPage(items, filter.Limit), nil
}

func normalizeIntentListFilter(filter IntentListFilter) IntentListFilter {
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

func trimIntentListPage(items []*SendIntent, limit int) IntentListPage {
	page := IntentListPage{Items: items}
	if len(items) <= limit {
		return page
	}
	page.Items = items[:limit]
	if last := page.Items[len(page.Items)-1]; last != nil && last.ID > 0 {
		page.NextAfterID = last.ID
	}
	return page
}

// GetJob resolves one send job with user scope.
func (s *Service) GetJob(ctx context.Context, userID int64, publicID uuid.UUID) (*SendJob, error) {
	return s.repo.GetJobOwned(ctx, userID, publicID)
}

func sendGateErr(reason string) error {
	switch reason {
	case apperr.CodeEntitlementRequired, apperr.CodeEntitlementExpired, apperr.CodeFeatureNotEntitled:
		return apperr.New(reason, apperr.KindForbidden, "entitlement does not allow this action")
	case apperr.CodeDailySendQuotaExceeded:
		return apperr.New(reason, apperr.KindQuota, "daily send quota exceeded")
	default:
		return apperr.New(apperr.CodeForbidden, apperr.KindForbidden, "action not allowed")
	}
}

func jsonOf(m map[string]string) []byte {
	b, err := json.Marshal(m)
	if err != nil {
		return []byte("{}")
	}
	return b
}
