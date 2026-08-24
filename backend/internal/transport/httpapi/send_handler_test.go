package httpapi

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

func TestParseIntentFilter(t *testing.T) {
	accountID := uuid.New()
	friendID := uuid.New()
	r := httptest.NewRequest("GET", "/api/v1/send-intents?account_id="+accountID.String()+"&friend_id="+friendID.String()+"&status=succeeded&from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z", nil)

	filter, err := parseIntentFilter(r)
	if err != nil {
		t.Fatalf("parseIntentFilter() error = %v", err)
	}
	if filter.AccountID == nil || *filter.AccountID != accountID {
		t.Fatalf("account filter = %v, want %v", filter.AccountID, accountID)
	}
	if filter.FriendID == nil || *filter.FriendID != friendID {
		t.Fatalf("friend filter = %v, want %v", filter.FriendID, friendID)
	}
	if filter.Status != "succeeded" {
		t.Fatalf("status filter = %q, want succeeded", filter.Status)
	}
	if filter.From == nil || !filter.From.Equal(time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("from filter = %v", filter.From)
	}
	if filter.To == nil || !filter.To.Equal(time.Date(2026, time.August, 2, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("to filter = %v", filter.To)
	}
}

func TestParseIntentFilterDecodesCursorAndLimit(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/v1/send-intents?limit=20&cursor="+encodeIntentCursor(42), nil)
	filter, err := parseIntentFilter(r)
	if err != nil {
		t.Fatal(err)
	}
	if filter.Limit != 20 || filter.AfterID != 42 {
		t.Fatalf("pagination filter = %+v", filter)
	}
}

func TestIntentViewIncludesTaskSummary(t *testing.T) {
	taskID := uuid.New()
	body := "晚间火花问候"
	kind := "text"
	view := intentView(&send.SendIntent{PublicID: uuid.New(), TaskPublicID: &taskID, TaskMessageKind: &kind, TaskMessageBody: &body})
	if view.Task == nil || view.Task.ID != taskID || view.Task.MessageKind != kind || view.Task.Body == nil || *view.Task.Body != body {
		t.Fatalf("task summary = %+v, want id=%s kind=%s body=%q", view.Task, taskID, kind, body)
	}
}

func TestParseIntentFilterRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name string
		url  string
	}{
		{name: "invalid account id", url: "/?account_id=not-a-uuid"},
		{name: "invalid status", url: "/?status=unknown"},
		{name: "invalid from", url: "/?from=not-a-time"},
		{name: "reversed range", url: "/?from=2026-08-02T00:00:00Z&to=2026-08-01T00:00:00Z"},
		{name: "invalid limit", url: "/?limit=101"},
		{name: "invalid cursor", url: "/?cursor=!"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := parseIntentFilter(httptest.NewRequest("GET", tt.url, nil)); err == nil {
				t.Fatal("parseIntentFilter() error = nil, want validation error")
			}
		})
	}
}
