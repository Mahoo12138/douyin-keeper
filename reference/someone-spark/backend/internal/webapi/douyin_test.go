package webapi

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoginRateIsPerMinuteAndNamed(t *testing.T) {
	b, err := os.ReadFile("douyin.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, `allowRateNamed`) || !strings.Contains(s, `"login_rate_limited"`) {
		t.Fatal("扫码/短信须用独立 429 文案，勿与抖音限流混用")
	}
	if !strings.Contains(s, `8, time.Minute`) || !strings.Contains(s, `20, time.Minute`) {
		t.Fatal("扫码/短信限流须为每号每分钟 8、每 IP 每分钟 20")
	}
	if strings.Contains(s, `rl:qr:acc:`) && strings.Contains(s, `8, time.Hour`) {
		t.Fatal("扫码不得再按小时封死")
	}
	if !strings.Contains(s, "cancelLogin") || !strings.Contains(s, "admitLogin") {
		t.Fatal("扫码须能取消卡住的号锁，锁占用时不得再入队")
	}
	if !strings.Contains(s, "jobs.CancelLogin") || !strings.Contains(s, "sidecar.KillTree") {
		t.Fatal("取消作业须写 cancel 并杀掉卡住的 Playwright")
	}
}

func TestLoginCancelRoute(t *testing.T) {
	b, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, `"/douyin/:id/login/cancel"`) {
		t.Fatal("须暴露 POST /login/cancel")
	}
	if !strings.Contains(s, `"/douyin/:id/login/qr/sms"`) {
		t.Fatal("须暴露 POST /login/qr/sms 把验证码交给扫码中的浏览器")
	}
	if !strings.Contains(s, "660 * time.Second") {
		t.Fatal("SSE 写超时须覆盖扫码与身份验证等待")
	}
}

func TestGetDouyinReportsLoginPending(t *testing.T) {
	b, err := os.ReadFile("douyin.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, `item["login_pending"]`) || !strings.Contains(s, "loginJobPending") {
		t.Fatal("GET /douyin/:id 须返回 login_pending，避免前端空转误判")
	}
	if !strings.Contains(s, `Cache-Control", "no-store"`) {
		t.Fatal("号位详情不得缓存陈旧 session_status")
	}
	page, err := os.ReadFile(filepath.Join("..", "..", "..", "frontend", "src", "views", "user", "DouyinDetailPage.vue"))
	if err != nil {
		t.Fatal(err)
	}
	vue := string(page)
	if !strings.Contains(vue, "未检测到登录，请重试或取消作业") || !strings.Contains(vue, "pollLeft = 150") {
		t.Fatal("号位详情轮询须有上限并提示重试")
	}
	if !strings.Contains(vue, "sms_required") || !strings.Contains(vue, "needQRSms") || !strings.Contains(vue, "/login/qr/sms") {
		t.Fatal("号位详情须在扫码后身份验证时显示短信输入并提交到同一作业")
	}
	if !strings.Contains(vue, "sms_wait") || !strings.Contains(vue, "sms_bad") {
		t.Fatal("号位详情须展示提交后等待与验证失败提示，避免前端假卡")
	}
	if !strings.Contains(vue, "has_session") || !strings.Contains(vue, "login_pending") {
		t.Fatal("轮询须认 has_session / login_pending")
	}
	if strings.Contains(vue, "onMounted") && strings.Contains(vue, "startStatusPoll()") {
		if !strings.Contains(vue, "await load()") {
			t.Fatal("进入页面只应拉一次详情")
		}
	}
	if strings.Contains(vue, "https://dy.ovim.cn") || strings.Contains(vue, "baseURL: \"http") {
		t.Fatal("号位详情须用相对路径 /api/v1")
	}
}

func TestAccountDTOHasNoSecrets(t *testing.T) {
	a := dyAccount{
		PublicID:       "01TESTPUBLICID000000000001",
		Nickname:       sql.NullString{String: "nick-a", Valid: true},
		SessionStatus:  "valid",
		HasSession:     true,
		PhoneCipher:    []byte("cipher-not-for-json"),
		PreferProtocol: true,
	}
	m := a.dto()
	for _, k := range []string{"session_blob", "cookies", "cookie", "storage_state", "phone_cipher"} {
		if _, ok := m[k]; ok {
			t.Fatalf("泄漏字段 %s", k)
		}
	}
	if m["has_session"] != true {
		t.Fatal("应有 has_session")
	}
	if strings.Contains(m["public_id"].(string), "cipher") {
		t.Fatal("public_id 异常")
	}
}
