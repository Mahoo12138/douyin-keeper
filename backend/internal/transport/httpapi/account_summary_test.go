package httpapi

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
)

func TestAccountSummaryViewIncludesOperationalCounters(t *testing.T) {
	checked := time.Date(2026, 8, 24, 10, 0, 0, 0, time.UTC)
	item := &account.Summary{
		Account:     account.Account{PublicID: uuid.New(), Nickname: "测试账号", LastSessionCheckAt: &checked},
		FriendCount: 12, EnabledTaskCount: 4, TodaySendSucceeded: 9, TodaySendFailed: 2,
	}

	view := accountSummaryView(item)
	if view.ID != item.Account.PublicID || view.Nickname != item.Account.Nickname || view.LastSessionCheckAt == nil || !view.LastSessionCheckAt.Equal(checked) {
		t.Fatalf("base account view = %+v", view)
	}
	if view.FriendCount != 12 || view.EnabledTaskCount != 4 || view.TodaySendSucceeded != 9 || view.TodaySendFailed != 2 {
		t.Fatalf("summary counters = %+v", view)
	}
}
