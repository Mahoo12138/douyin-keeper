package httpapi

import (
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
