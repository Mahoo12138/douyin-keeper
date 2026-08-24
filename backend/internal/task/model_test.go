package task

import (
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

func TestSparkTaskValidation(t *testing.T) {
	body := "晚安"
	tests := []struct {
		name          string
		task          SparkTask
		validWindow   bool
		validMessage  bool
		validTimezone bool
	}{
		{
			name:        "valid text task",
			task:        SparkTask{WindowStart: "19:30:00", WindowEnd: "22:30:00", Timezone: "Asia/Shanghai", MessageKind: "text", MessageBody: &body},
			validWindow: true, validMessage: true, validTimezone: true,
		},
		{
			name:        "cross midnight window is rejected",
			task:        SparkTask{WindowStart: "22:30:00", WindowEnd: "01:00:00", Timezone: "Asia/Shanghai", MessageKind: "text", MessageBody: &body},
			validWindow: false, validMessage: true, validTimezone: true,
		},
		{
			name:        "blank text is rejected",
			task:        SparkTask{WindowStart: "19:30:00", WindowEnd: "22:30:00", Timezone: "Asia/Shanghai", MessageKind: "text", MessageBody: stringPtr("  ")},
			validWindow: true, validMessage: false, validTimezone: true,
		},
		{
			name:        "invalid timezone is rejected",
			task:        SparkTask{WindowStart: "19:30:00", WindowEnd: "22:30:00", Timezone: "Mars/Olympus", MessageKind: "sticker", MessageBody: stringPtr("sticker_001")},
			validWindow: true, validMessage: true, validTimezone: false,
		},
		{
			name:        "blank sticker id is rejected",
			task:        SparkTask{WindowStart: "19:30:00", WindowEnd: "22:30:00", Timezone: "Asia/Shanghai", MessageKind: "sticker", MessageBody: stringPtr("  ")},
			validWindow: true, validMessage: false, validTimezone: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.task.ValidWindow(); got != tt.validWindow {
				t.Errorf("ValidWindow() = %t, want %t", got, tt.validWindow)
			}
			if got := tt.task.ValidMessage(); got != tt.validMessage {
				t.Errorf("ValidMessage() = %t, want %t", got, tt.validMessage)
			}
			if got := tt.task.ValidTimezone(); got != tt.validTimezone {
				t.Errorf("ValidTimezone() = %t, want %t", got, tt.validTimezone)
			}
		})
	}
}

func TestApplyPatchPreservesUnspecifiedTaskFields(t *testing.T) {
	body := "旧消息"
	task := &SparkTask{
		Enabled: true, Timezone: "Asia/Shanghai", WindowStart: "19:30:00", WindowEnd: "22:30:00",
		MessageKind: "text", MessageBody: &body, AllowFirstMessage: false,
	}
	newBody := "新消息"
	applyPatch(task, TaskPatch{Enabled: boolPtr(false), MessageBody: &newBody, AllowFirstMessage: boolPtr(true)})

	if task.Enabled || task.MessageBody == nil || *task.MessageBody != newBody || !task.AllowFirstMessage {
		t.Fatalf("patch did not update requested fields: %+v", task)
	}
	if task.Timezone != "Asia/Shanghai" || task.WindowStart != "19:30:00" || task.WindowEnd != "22:30:00" || task.MessageKind != "text" {
		t.Fatalf("patch changed unspecified fields: %+v", task)
	}
}

func TestQuotaGateErrorMapping(t *testing.T) {
	for _, code := range []string{apperr.CodeEntitlementRequired, apperr.CodeEntitlementExpired, apperr.CodeFeatureNotEntitled} {
		err := quotaGateErr(code)
		app, ok := apperr.As(err)
		if !ok || app.Code != code || app.Kind != apperr.KindForbidden {
			t.Errorf("quotaGateErr(%q) = %v, want forbidden code", code, err)
		}
	}
	if app, ok := apperr.As(quotaGateErr("unknown")); !ok || app.Code != apperr.CodeTaskQuotaExceeded || app.Kind != apperr.KindQuota {
		t.Errorf("unknown quota reason mapped incorrectly: %v", app)
	}
}

func stringPtr(value string) *string { return &value }

func boolPtr(value bool) *bool { return &value }
