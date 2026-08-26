package send

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

type pageRepoStub struct {
	items  []*SendIntent
	filter IntentListFilter
}

func (r *pageRepoStub) ListIntentsByUser(context.Context, int64, IntentListFilter) ([]*SendIntent, error) {
	return r.items, nil
}
func (r *pageRepoStub) ListIntentsByUserPage(_ context.Context, _ int64, filter IntentListFilter) ([]*SendIntent, error) {
	r.filter = filter
	return r.items, nil
}
func (r *pageRepoStub) CreateIntent(context.Context, *SendIntent) error { return nil }
func (r *pageRepoStub) CreateScheduledIntent(context.Context, *SendIntent) (bool, error) {
	return true, nil
}
func (r *pageRepoStub) GetManualIntentByRequestIDOwned(context.Context, int64, uuid.UUID) (*SendIntent, *SendJob, error) {
	return nil, nil, nil
}
func (r *pageRepoStub) GetIntentByID(context.Context, int64) (*SendIntent, error) { return nil, nil }
func (r *pageRepoStub) GetIntentByPublicID(context.Context, uuid.UUID) (*SendIntent, error) {
	return nil, nil
}
func (r *pageRepoStub) GetIntentOwned(context.Context, int64, uuid.UUID) (*SendIntent, error) {
	return nil, nil
}
func (r *pageRepoStub) CreateJob(context.Context, *SendJob) error { return nil }
func (r *pageRepoStub) GetJobByPublicID(context.Context, uuid.UUID) (*SendJob, error) {
	return nil, nil
}
func (r *pageRepoStub) GetJobOwned(context.Context, int64, uuid.UUID) (*SendJob, error) {
	return nil, nil
}
func (r *pageRepoStub) ClaimJob(context.Context, uuid.UUID, string, time.Duration) (*SendJob, error) {
	return nil, nil
}
func (r *pageRepoStub) CancelQueuedJob(context.Context, int64, *string, time.Time) (bool, error) {
	return false, nil
}
func (r *pageRepoStub) HeartbeatJob(context.Context, int64, string, time.Duration) error { return nil }
func (r *pageRepoStub) FindExpiredJobs(context.Context, time.Time, int) ([]ExpiredSendJob, error) {
	return nil, nil
}
func (r *pageRepoStub) FindRetryDue(context.Context, time.Time, int) ([]RetryDueIntent, error) {
	return nil, nil
}
func (r *pageRepoStub) FinishJob(context.Context, int64, JobStatus, *string, bool, *string, time.Time) error {
	return nil
}
func (r *pageRepoStub) SetIntentStatus(context.Context, int64, IntentStatus, *string, *time.Time, time.Time) error {
	return nil
}
func (r *pageRepoStub) SetIntentLastJob(context.Context, int64, int64) error   { return nil }
func (r *pageRepoStub) CountJobsForIntent(context.Context, int64) (int, error) { return 0, nil }

func TestListIntentsPageNormalizesAndTrimsCursor(t *testing.T) {
	repo := &pageRepoStub{items: []*SendIntent{{ID: 3}, {ID: 2}, {ID: 1}}}
	service := NewService(repo, nil, nil, nil, nil, nil)
	page, err := service.ListIntentsPage(context.Background(), 7, IntentListFilter{Limit: 2, AfterID: 9, Status: "succeeded"})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].ID != 3 || page.Items[1].ID != 2 || page.NextAfterID != 2 {
		t.Fatalf("page = %+v", page)
	}
	if repo.filter.Limit != 2 || repo.filter.AfterID != 9 || repo.filter.Status != "succeeded" {
		t.Fatalf("filter = %+v", repo.filter)
	}
}

type runNowRepoStub struct {
	*pageRepoStub
	existing    *SendIntent
	existingJob *SendJob
	lookups     int
	createErr   error
}

func (r *runNowRepoStub) GetManualIntentByRequestIDOwned(context.Context, int64, uuid.UUID) (*SendIntent, *SendJob, error) {
	r.lookups++
	if r.lookups == 1 && r.createErr != nil {
		return nil, nil, nil
	}
	return r.existing, r.existingJob, nil
}

func (r *runNowRepoStub) CreateIntent(_ context.Context, in *SendIntent) error {
	if r.createErr != nil {
		return r.createErr
	}
	in.ID = 100
	return nil
}

func (r *runNowRepoStub) CreateJob(_ context.Context, job *SendJob) error {
	job.ID = 200
	return nil
}

func (r *runNowRepoStub) SetIntentLastJob(context.Context, int64, int64) error { return nil }

type runNowTaskStub struct{ item *task.SparkTask }

func (s runNowTaskStub) GetOwned(context.Context, int64, uuid.UUID) (*task.SparkTask, error) {
	return s.item, nil
}

type runNowGateStub struct{ calls int }

func (s *runNowGateStub) Authorize(context.Context, entitlement.AuthorizationRequest) (entitlement.AuthorizationDecision, error) {
	s.calls++
	return entitlement.AuthorizationDecision{Allowed: true}, nil
}

type runNowQuotaStub struct{ reservations int }

func (s *runNowQuotaStub) ReserveDaily(context.Context, int64, string) error {
	s.reservations++
	return nil
}
func (s *runNowQuotaStub) ReleaseDaily(context.Context, int64, string) error { return nil }

type runNowOutboxStub struct{ adds int }

func (s *runNowOutboxStub) Add(context.Context, outbox.Message) error {
	s.adds++
	return nil
}

type runNowTxStub struct{ calls int }

func (s *runNowTxStub) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	s.calls++
	return fn(ctx)
}

func TestRunNowReplaysClientRequestWithoutReservingAgain(t *testing.T) {
	requestID := uuid.New()
	taskID := int64(41)
	existing := &SendIntent{ID: 11, PublicID: uuid.New(), TaskID: &taskID, Status: IntentQueued}
	existingJob := &SendJob{ID: 12, PublicID: uuid.New(), Status: JobQueued}
	repo := &runNowRepoStub{pageRepoStub: &pageRepoStub{}, existing: existing, existingJob: existingJob}
	gate := &runNowGateStub{}
	quota := &runNowQuotaStub{}
	tx := &runNowTxStub{}
	service := NewService(repo, runNowTaskStub{item: &task.SparkTask{ID: taskID}}, gate, quota, &runNowOutboxStub{}, tx)

	gotIntent, gotJob, err := service.RunNow(context.Background(), 7, uuid.New(), requestID.String())
	if err != nil {
		t.Fatal(err)
	}
	if gotIntent.PublicID != existing.PublicID || gotJob.PublicID != existingJob.PublicID {
		t.Fatalf("replay returned new ids: intent=%+v job=%+v", gotIntent, gotJob)
	}
	if gate.calls != 0 || quota.reservations != 0 || tx.calls != 0 {
		t.Fatalf("replay performed new work: gate=%d reservations=%d tx=%d", gate.calls, quota.reservations, tx.calls)
	}
}

func TestRunNowResolvesUniqueKeyRaceByReplayingWinner(t *testing.T) {
	requestID := uuid.New()
	taskID := int64(41)
	existing := &SendIntent{ID: 11, PublicID: uuid.New(), TaskID: &taskID, Status: IntentQueued}
	existingJob := &SendJob{ID: 12, PublicID: uuid.New(), Status: JobQueued}
	repo := &runNowRepoStub{
		pageRepoStub: &pageRepoStub{}, existing: existing, existingJob: existingJob,
		createErr: ErrIntentIdempotencyConflict,
	}
	gate := &runNowGateStub{}
	quota := &runNowQuotaStub{}
	outboxStub := &runNowOutboxStub{}
	tx := &runNowTxStub{}
	service := NewService(repo, runNowTaskStub{item: &task.SparkTask{ID: taskID, AccountID: 8, FriendID: 9, MessageKind: "text"}}, gate, quota, outboxStub, tx)

	gotIntent, gotJob, err := service.RunNow(context.Background(), 7, uuid.New(), requestID.String())
	if err != nil {
		t.Fatal(err)
	}
	if gotIntent.PublicID != existing.PublicID || gotJob.PublicID != existingJob.PublicID || repo.lookups != 2 {
		t.Fatalf("race replay mismatch: intent=%+v job=%+v lookups=%d", gotIntent, gotJob, repo.lookups)
	}
	if quota.reservations != 1 || outboxStub.adds != 0 || tx.calls != 1 {
		t.Fatalf("race path did not rollback new side effects: reservations=%d outbox=%d tx=%d", quota.reservations, outboxStub.adds, tx.calls)
	}
}

func TestRunNowRequiresClientIdempotencyKey(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	if _, _, err := service.RunNow(context.Background(), 7, uuid.New(), ""); err == nil {
		t.Fatal("missing Idempotency-Key should be rejected")
	}
}
