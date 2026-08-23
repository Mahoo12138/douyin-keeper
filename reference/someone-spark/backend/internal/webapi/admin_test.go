package webapi

import (
	"os"
	"strings"
	"testing"
)

func TestAdjustRequiresRemark(t *testing.T) {
	b, err := os.ReadFile("admin_users.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, "admin.balance_adjust") {
		t.Fatal("调余额必须写审计")
	}
	if !strings.Contains(s, "备注至少 4") {
		t.Fatal("备注至少 4 字")
	}
}

func TestCardListHasNoPlaintext(t *testing.T) {
	b, err := os.ReadFile("admin_ops.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if strings.Contains(s, "code_plain") || strings.Contains(strings.ToLower(s), "select raw") {
		t.Fatal("批次列表不得回明文")
	}
	if !strings.Contains(s, "unused") {
		t.Fatal("应统计未兑")
	}
}

func TestChatReadAudit(t *testing.T) {
	b, err := os.ReadFile("admin_review.go")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `admin.chat_read`) {
		t.Fatal("审核打开须写 admin.chat_read")
	}
}

func TestRegisterSettingKey(t *testing.T) {
	b, err := os.ReadFile("admin_settings.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, "register.enabled") {
		t.Fatal("站点须能关注册")
	}
	if !strings.Contains(s, "send.daily_limit") {
		t.Fatal("站点须能改日限额")
	}
	if !strings.Contains(s, "bustAdminDash") {
		t.Fatal("改设置须清看板缓存")
	}
	if !strings.Contains(s, `k == "smtp.password"`) || !strings.Contains(s, `strings.TrimSpace(v) == ""`) {
		t.Fatal("空 SMTP 密码不得覆盖已有值")
	}
	if !strings.Contains(s, "siteSMTP") {
		t.Fatal("发信须能读后台 SMTP")
	}
}

func TestAdminCanClearLoginRate(t *testing.T) {
	for _, name := range []string{"admin_ops.go", "server.go"} {
		b, err := os.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		s := string(b)
		if name == "server.go" && !strings.Contains(s, "/login-rate/clear") {
			t.Fatal("须有管理员解除扫码限流路由")
		}
		if name == "admin_ops.go" && (!strings.Contains(s, "admin.login_rate_clear") || !strings.Contains(s, "rl:qr:")) {
			t.Fatal("解除限流须删 Redis 键并写审计")
		}
	}
}

func TestRegisterClosedInAuth(t *testing.T) {
	b, err := os.ReadFile("auth.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, `register.enabled`) || !strings.Contains(s, "register_closed") {
		t.Fatal("注册关闭必须挡接口")
	}
	if !strings.Contains(s, "allowRateNamed") || !strings.Contains(s, "秒后再试") {
		t.Fatal("429 须写清还要等多少秒")
	}
}

func TestAdminDashNoSecrets(t *testing.T) {
	b, err := os.ReadFile("admin_dash.go")
	if err != nil {
		t.Fatal(err)
	}
	s := strings.ToLower(string(b))
	for _, bad := range []string{"session_blob", "storage_state", "cookie", "phone_cipher"} {
		if strings.Contains(s, bad) {
			t.Fatal(bad)
		}
	}
}

func TestChatListHasNoBodyField(t *testing.T) {
	b, err := os.ReadFile("admin_review.go")
	if err != nil {
		t.Fatal(err)
	}
	chunk := string(b)
	idx := strings.Index(chunk, "func (s *Server) adminListChat")
	if idx < 0 {
		t.Fatal("找不到列表")
	}
	part := chunk[idx:]
	if end := strings.Index(part[10:], "\nfunc "); end > 0 {
		part = part[:end+10]
	}
	if strings.Contains(part, `"body"`) {
		t.Fatal("列表不得摊开正文")
	}
	if !strings.Contains(part, "preview") {
		t.Fatal("列表应给预览")
	}
}
