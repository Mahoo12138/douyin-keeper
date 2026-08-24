package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
)

func TestAdminJobFilterDecodesStatusTypeAndCursor(t *testing.T) {
	createdAt := time.Date(2026, 8, 24, 12, 0, 0, 123456789, time.UTC)
	filter, err := adminJobFilter(httptest.NewRequest("GET", "/?status=FAILED&type=account.bind.qr&limit=20&cursor="+encodeAdminJobCursor(createdAt, 42), nil))
	if err != nil {
		t.Fatal(err)
	}
	if filter.Status != "failed" || filter.Type != "account.bind.qr" || filter.Limit != 20 || filter.AfterID != 42 || filter.AfterCreatedAt == nil || !filter.AfterCreatedAt.Equal(createdAt) {
		t.Fatalf("filter = %+v", filter)
	}
}

func TestAdminJobFilterRejectsInvalidInputs(t *testing.T) {
	for _, query := range []string{
		"status=unknown",
		"type=" + strings.Repeat("x", 101),
		"cursor=!",
		"cursor=" + encodeAdminJobCursor(time.Now(), 0),
		"limit=101",
	} {
		if _, err := adminJobFilter(httptest.NewRequest("GET", "/?"+query, nil)); err == nil {
			t.Fatalf("query %q should be rejected", query)
		}
	}
}

func TestAdminJobViewContainsLifecycleMetadataOnly(t *testing.T) {
	userID, accountID := uuid.New(), uuid.New()
	createdAt := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	view := adminJobViewFrom(admin.JobSummary{
		PublicID: uuid.New(), UserPublicID: &userID, AccountPublicID: &accountID,
		Type: "account.bind.qr", Status: "failed", ErrorCode: stringPtr("SESSION_EXPIRED"),
		WorkerID: stringPtr("worker-1"), CreatedAt: createdAt,
	})
	raw, err := json.Marshal(view)
	if err != nil {
		t.Fatal(err)
	}
	serialized := string(raw)
	if !strings.Contains(serialized, `"user_id":"`+userID.String()+`"`) || !strings.Contains(serialized, `"status":"failed"`) {
		t.Fatalf("view missing lifecycle fields: %s", serialized)
	}
	if strings.Contains(serialized, "payload") || strings.Contains(serialized, "session") {
		t.Fatalf("job view exposed sensitive/event fields: %s", serialized)
	}
}

func stringPtr(value string) *string { return &value }
