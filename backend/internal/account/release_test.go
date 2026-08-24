package account

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

type releaseRepo struct {
	account     *Account
	softDeleted bool
	status      BindingStatus
}

func (r *releaseRepo) ListOwned(_ context.Context, _ int64) ([]*Account, error) {
	if r.account == nil {
		return nil, nil
	}
	return []*Account{r.account}, nil
}
func (r *releaseRepo) GetOwned(context.Context, int64, uuid.UUID) (*Account, error) {
	return r.account, nil
}
func (r *releaseRepo) GetByID(context.Context, int64) (*Account, error) { return r.account, nil }
func (r *releaseRepo) Create(context.Context, *Account) error           { return nil }
func (r *releaseRepo) SetBindingStatus(_ context.Context, _ int64, status BindingStatus) error {
	r.status = status
	return nil
}
func (r *releaseRepo) SetIdentity(context.Context, int64, string, string, *string) error  { return nil }
func (r *releaseRepo) SetPaused(context.Context, int64, *time.Time) error                 { return nil }
func (r *releaseRepo) SetRiskStatus(context.Context, int64, RiskStatus, *time.Time) error { return nil }
func (r *releaseRepo) SetSessionStatus(context.Context, int64, SessionStatus, time.Time) error {
	return nil
}
func (r *releaseRepo) SetLastFriendSyncAt(context.Context, int64, time.Time) error { return nil }
func (r *releaseRepo) SoftDelete(context.Context, int64) error {
	r.softDeleted = true
	r.status = BindingReleased
	return nil
}
func (r *releaseRepo) CountQuotaOccupied(context.Context, int64) (int, error) { return 0, nil }

type inlineReleaseTx struct{}

func (inlineReleaseTx) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

func TestReleaseDelegatesToAtomicRepositoryCleanup(t *testing.T) {
	publicID := uuid.New()
	repo := &releaseRepo{account: &Account{ID: 42, PublicID: publicID}}
	service := NewService(repo, inlineReleaseTx{}, nil, nil, nil, nil)

	if err := service.Release(context.Background(), 7, publicID); err != nil {
		t.Fatal(err)
	}
	if !repo.softDeleted {
		t.Fatal("release should soft-delete the account")
	}
	if repo.status != BindingReleased {
		t.Fatalf("binding status = %q, want %q", repo.status, BindingReleased)
	}
}

func TestListOwnedSummaryFallsBackForLeanRepositories(t *testing.T) {
	repo := &releaseRepo{account: &Account{ID: 42, PublicID: uuid.New(), Nickname: "账号"}}
	service := NewService(repo, inlineReleaseTx{}, nil, nil, nil, nil)

	summaries, err := service.ListOwnedSummary(context.Background(), 7)
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) != 1 || summaries[0].Account.Nickname != "账号" {
		t.Fatalf("summary account = %+v", summaries)
	}
	if summaries[0].FriendCount != 0 || summaries[0].EnabledTaskCount != 0 || summaries[0].TodaySendSucceeded != 0 || summaries[0].TodaySendFailed != 0 {
		t.Fatalf("fallback counters = %+v", summaries[0])
	}
}
