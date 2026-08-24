package integration

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/friend"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

func redeemQuotaCard(t *testing.T, ent *entitlement.Service, userID, adminID int64, accountQuota, taskQuota int) {
	t.Helper()
	plan, err := ent.CreatePlan(context.Background(), &entitlement.Plan{
		Code: "quota_" + randSuffix(), Name: "并发配额测试", Status: entitlement.StatusActive,
		AccountQuota: accountQuota, TaskQuota: taskQuota, DailySendQuota: 10,
		Features: map[string]bool{"browser_text_send": true},
	})
	if err != nil {
		t.Fatalf("create quota plan: %v", err)
	}
	codes, err := ent.CreateBatchWithCodes(context.Background(), &entitlement.CardBatch{
		EntitlementPlanID: plan.ID, Name: "quota-test", DurationDays: 30, Quantity: 1,
		Status: entitlement.StatusActive, CodeVersion: entitlement.CardCodeVersion1, CreatedBy: adminID,
	})
	if err != nil {
		t.Fatalf("create quota batch: %v", err)
	}
	if _, _, err := ent.Redeem(context.Background(), userID, codes[0]); err != nil {
		t.Fatalf("redeem quota card: %v", err)
	}
}

func runConcurrent[T any](t *testing.T, fn func() (T, error)) ([]T, []error) {
	t.Helper()
	start := make(chan struct{})
	results := make([]T, 2)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	for i := range results {
		go func(i int) {
			defer wg.Done()
			<-start
			results[i], errs[i] = fn()
		}(i)
	}
	close(start)
	wg.Wait()
	return results, errs
}

func TestConcurrentBindingRespectsAccountQuota(t *testing.T) {
	ctx := context.Background()
	ent := newEntSvc()
	adminID := newUser(t)
	userID := newUser(t)
	redeemQuotaCard(t, ent, userID, adminID, 1, 10)

	accounts := postgres.NewAccountRepo(pool)
	service := account.NewService(accounts, newTx(), ent, postgres.NewUserLockRepo(pool),
		postgres.NewJobRepo(pool), postgres.NewOutboxRepo(pool))
	jobs, errs := runConcurrent(t, func() (uuid.UUID, error) {
		return service.CreateBinding(ctx, userID, "qr", "")
	})

	successes := 0
	quotaErrors := 0
	for i, err := range errs {
		if err == nil {
			if jobs[i] == uuid.Nil {
				t.Fatalf("binding %d returned an empty job id", i)
			}
			successes++
			continue
		}
		if appErr, ok := apperr.As(err); ok && appErr.Code == apperr.CodeAccountQuotaExceeded {
			quotaErrors++
			continue
		}
		t.Fatalf("binding %d returned unexpected error: %v", i, err)
	}
	if successes != 1 || quotaErrors != 1 {
		t.Fatalf("expected one binding and one quota rejection, successes=%d quota_errors=%d", successes, quotaErrors)
	}
	if n, err := accounts.CountQuotaOccupied(ctx, userID); err != nil || n != 1 {
		t.Fatalf("expected one occupied account, count=%d err=%v", n, err)
	}
}

func seedBoundAccountAndFriend(t *testing.T, userID int64) (*account.Account, *friend.Friend) {
	t.Helper()
	ctx := context.Background()
	accounts := postgres.NewAccountRepo(pool)
	now := time.Now()
	acct := &account.Account{
		PublicID: uuid.New(), UserID: userID, BindingStatus: account.BindingBound,
		SessionStatus: account.SessionValid, RiskStatus: account.RiskNormal,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := accounts.Create(ctx, acct); err != nil {
		t.Fatalf("create bound account: %v", err)
	}

	platformUserID := "platform_" + randSuffix()
	friends := postgres.NewFriendRepo(pool)
	if err := friends.SyncBatch(ctx, acct.ID, []friend.SyncItem{{
		PlatformUserID: &platformUserID, IdentityStatus: friend.IdentityResolved,
		DisplayName: "测试好友", Nickname: "测试好友",
	}}, []string{platformUserID}, nil, now); err != nil {
		t.Fatalf("seed friend: %v", err)
	}
	item, err := friends.ListByAccountOwned(ctx, userID, acct.PublicID)
	if err != nil || len(item) != 1 {
		t.Fatalf("load seeded friend: count=%d err=%v", len(item), err)
	}
	return acct, item[0]
}

func TestConcurrentTaskCreateRespectsTaskQuota(t *testing.T) {
	ctx := context.Background()
	ent := newEntSvc()
	adminID := newUser(t)
	userID := newUser(t)
	redeemQuotaCard(t, ent, userID, adminID, 2, 1)
	acct, f := seedBoundAccountAndFriend(t, userID)

	service := task.NewService(postgres.NewTaskRepo(pool), postgres.NewAccountRepo(pool),
		postgres.NewFriendRepo(pool), ent, postgres.NewUserLockRepo(pool), newTx())
	body := "并发配额测试消息"
	input := task.CreateInput{
		AccountPublicID: acct.PublicID, FriendPublicID: f.PublicID,
		Timezone: "Asia/Shanghai", WindowStart: "09:00:00", WindowEnd: "10:00:00",
		MessageKind: "text", MessageBody: &body, Enabled: true,
	}
	tasks, errs := runConcurrent(t, func() (*task.SparkTask, error) {
		return service.Create(ctx, userID, input)
	})

	successes := 0
	quotaErrors := 0
	for i, err := range errs {
		if err == nil {
			if tasks[i] == nil || tasks[i].ID == 0 {
				t.Fatalf("task %d returned an empty task", i)
			}
			successes++
			continue
		}
		if appErr, ok := apperr.As(err); ok && appErr.Code == apperr.CodeTaskQuotaExceeded {
			quotaErrors++
			continue
		}
		t.Fatalf("task %d returned unexpected error: %v", i, err)
	}
	if successes != 1 || quotaErrors != 1 {
		t.Fatalf("expected one task and one quota rejection, successes=%d quota_errors=%d", successes, quotaErrors)
	}
	if n, err := postgres.NewTaskRepo(pool).CountTasks(ctx, userID); err != nil || n != 1 {
		t.Fatalf("expected one task, count=%d err=%v", n, err)
	}
}
