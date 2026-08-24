package asynqworker

import (
	"testing"
)

func TestSMSRequestInputsTrimUserInput(t *testing.T) {
	start := smsStartInput("/tmp/sms-profile", "  +86 13800138000  ")
	if start["phone"] != "+86 13800138000" || start["profile_dir"] != "/tmp/sms-profile" || start["locale"] != "zh-CN" {
		t.Fatalf("unexpected SMS start input: %+v", start)
	}
	verify := smsVerifyInput("sms_handle", " 123456 ", "/tmp/sms-profile/session.json")
	if verify["login_handle"] != "sms_handle" || verify["code"] != "123456" || verify["export_session_file"] != "/tmp/sms-profile/session.json" {
		t.Fatalf("unexpected SMS verify input: %+v", verify)
	}
}
