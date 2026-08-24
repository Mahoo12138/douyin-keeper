package httpapi

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/messagetemplate"
)

func TestMessageTemplateViewContainsOnlyUserFacingFields(t *testing.T) {
	now := time.Date(2026, 8, 24, 9, 0, 0, 0, time.UTC)
	view := messageTemplateView(&messagetemplate.Template{ID: 9, PublicID: uuid.New(), UserID: 42, Name: "问候", Kind: "text", Body: "晚上好", CreatedAt: now, UpdatedAt: now})
	if view.Name != "问候" || view.Kind != "text" || view.Body != "晚上好" || view.CreatedAt != "2026-08-24T09:00:00Z" {
		t.Fatalf("template view = %+v", view)
	}
}

func TestMessageTemplateFilterDecodesCursor(t *testing.T) {
	updatedAt := time.Date(2026, 8, 24, 9, 0, 0, 123456789, time.UTC)
	request := httptest.NewRequest("GET", "/?kind=sticker&limit=20&cursor="+encodeMessageTemplateCursor(updatedAt, 42), nil)
	filter, err := messageTemplateFilter(request)
	if err != nil {
		t.Fatal(err)
	}
	if filter.Kind != "sticker" || filter.Limit != 20 || filter.AfterID != 42 || filter.AfterUpdatedAt == nil || !filter.AfterUpdatedAt.Equal(updatedAt) {
		t.Fatalf("filter = %+v", filter)
	}
}

func TestMessageTemplateFilterRejectsInvalidCursorAndLimit(t *testing.T) {
	for _, query := range []string{"cursor=!", "cursor=" + encodeMessageTemplateCursor(time.Now(), 0), "limit=101", "limit=oops"} {
		if _, err := messageTemplateFilter(httptest.NewRequest("GET", "/?"+query, nil)); err == nil {
			t.Fatalf("query %q should be rejected", query)
		}
	}
}
