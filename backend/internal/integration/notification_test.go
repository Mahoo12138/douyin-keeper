package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
	"github.com/mahoo12138/douyin-keeper/backend/internal/risk"
)

func TestNotificationRepoDedupeReadStateAndRiskIntegration(t *testing.T) {
	ctx := context.Background()
	ownerID := newUser(t)
	acct := &account.Account{
		PublicID: uuid.New(), UserID: ownerID, Nickname: "通知账号",
		BindingStatus: account.BindingBound, SessionStatus: account.SessionValid,
		RiskStatus: account.RiskNormal, CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	accounts := postgres.NewAccountRepo(pool)
	if err := accounts.Create(ctx, acct); err != nil {
		t.Fatal(err)
	}

	notifications := postgres.NewNotificationRepo(pool)
	now := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	risks := risk.NewService(postgres.NewRiskRepo(pool), accounts, postgres.NewTxManager(pool), time.Minute).WithNotifier(notifications)
	risks.SetNow(func() time.Time { return now })
	if err := risks.Apply(ctx, acct.ID, "SESSION_EXPIRED", "browser.consumer", nil); err != nil {
		t.Fatalf("risk apply = %v", err)
	}
	// The same account/code on the same local day is deduplicated, while the
	// risk event itself remains append-only.
	if err := risks.Apply(ctx, acct.ID, "SESSION_EXPIRED", "browser.consumer", nil); err != nil {
		t.Fatalf("duplicate risk apply = %v", err)
	}

	items, unread, err := notifications.List(ctx, ownerID, notification.ListFilter{Limit: 20})
	if err != nil || len(items) != 1 || unread != 1 {
		t.Fatalf("notifications = %+v unread=%d err=%v", items, unread, err)
	}
	if items[0].Priority != notification.PriorityCritical || items[0].ResourceID == nil || *items[0].ResourceID != acct.PublicID.String() {
		t.Fatalf("risk notification = %+v", items[0])
	}
	updated, err := notifications.MarkRead(ctx, ownerID, items[0].PublicID)
	if err != nil || !updated {
		t.Fatalf("MarkRead() = %v, err=%v", updated, err)
	}
	_, unread, err = notifications.List(ctx, ownerID, notification.ListFilter{UnreadOnly: true, Limit: 20})
	if err != nil || unread != 0 {
		t.Fatalf("unread after MarkRead = %d, err=%v", unread, err)
	}
}
