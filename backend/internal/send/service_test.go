package send

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
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
