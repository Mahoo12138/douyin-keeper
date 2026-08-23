package jobs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSidecarsDoNotSeedBusiness(t *testing.T) {
	files := []string{
		filepath.Join("..", "..", "..", "worker-py", "main.py"),
		filepath.Join("..", "..", "..", "worker-py", "adapters", "douyin_web", "login_qr.py"),
		filepath.Join("..", "..", "..", "protocol-node", "index.mjs"),
	}
	for _, p := range files {
		b, err := os.ReadFile(p)
		if err != nil {
			t.Fatal(p, err)
		}
		s := string(b)
		for _, bad := range []string{"spark_", "阿茶", "假号", "假好友", "协议补档", "fake_uid", "假二维码"} {
			if strings.Contains(s, bad) {
				t.Fatalf("%s 含演示数据 %s", p, bad)
			}
		}
	}
	qr, err := os.ReadFile(filepath.Join("..", "..", "..", "worker-py", "adapters", "douyin_web", "login_qr.py"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(qr), "login_page_changed") || !strings.Contains(string(qr), "emit") {
		t.Fatal("扫码适配器须抽出真二维码并上报错误")
	}
	if !strings.Contains(string(qr), "has_session_cookie") || !strings.Contains(string(qr), "_HARD_S = 180") {
		t.Fatal("扫码须在 180 秒硬超时内轮询 sessionid")
	}
	if !strings.Contains(string(qr), "_IDENTITY_S") || !strings.Contains(string(qr), `_progress("identity"`) || !strings.Contains(string(qr), `"sms_required"`) {
		t.Fatal("扫码后须检测身份验证并立刻上报 sms_required")
	}
	if !strings.Contains(string(qr), "_click_recv_sms") || !strings.Contains(string(qr), "_peek_sms_code") || !strings.Contains(string(qr), "_fill_identity_code") {
		t.Fatal("身份验证须点「接收短信验证码」并填入网页验证码")
	}
	if !strings.Contains(string(qr), `_progress("sms_wait"`) || !strings.Contains(string(qr), "_POST_SMS_S") || !strings.Contains(string(qr), "_alive_page") {
		t.Fatal("提交验证码后须持续 progress、给足等待，且页面跳转后跟新 page")
	}
	if !strings.Contains(string(qr), `_progress("launch"`) || !strings.Contains(string(qr), `_progress("goto"`) || !strings.Contains(string(qr), `_progress("click_login"`) {
		t.Fatal("扫码须逐步 emit launch/goto/click_login")
	}
	if !strings.Contains(string(qr), `_progress("layer"`) || !strings.Contains(string(qr), `_progress("qr"`) || !strings.Contains(string(qr), `_progress("wait_session"`) {
		t.Fatal("扫码须逐步 emit layer/qr/wait_session")
	}
	if !strings.Contains(string(qr), "_GOTO_MS = 30000") || !strings.Contains(string(qr), "_LAYER_S = 25") {
		t.Fatal("goto 须 ≤30s、等登录层须 ≤25s")
	}
	if !strings.Contains(string(qr), "login-debug-") || !strings.Contains(string(qr), "os._exit(2)") {
		t.Fatal("硬超时须截图并失败，不得挂死")
	}
	if !strings.Contains(string(qr), "context.cookies()") || !strings.Contains(string(qr), `startswith("sessionid")`) {
		t.Fatal("扫码成功须轮询 context.cookies() 且以 sessionid 非空为准")
	}
	if i := strings.Index(string(qr), "export_state(context, state_out)"); i < 0 || strings.Index(string(qr), "public_identity(page, context)") < i {
		t.Fatal("扫码成功须先 export_state 再取昵称")
	}
	if !strings.Contains(string(qr), "douyin_rate_limited") {
		t.Fatal("扫码须把抖音「过于频繁」单独上报，不得自动连着重试")
	}
	sel, err := os.ReadFile(filepath.Join("..", "..", "..", "worker-py", "adapters", "douyin_web", "selectors.py"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(sel), "CHAT_URL") || !strings.Contains(string(sel), "SMS_PHONE_INPUT") {
		t.Fatal("选择器须独立放 adapters/douyin_web")
	}
	if !strings.Contains(string(sel), "IDENTITY_RECV_SMS") || !strings.Contains(string(sel), "接收短信验证码") {
		t.Fatal("选择器须包含扫码后身份验证文案")
	}
}

func TestJobsDoNotAutoBindFake(t *testing.T) {
	login, err := os.ReadFile("login.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(login)
	if strings.Contains(s, "假号") || strings.Contains(s, "spark_xxx") {
		t.Fatal("login.go")
	}
	if !strings.Contains(s, `slog.Info("login_qr 开始"`) {
		t.Fatal("LoginQR 一进来必须 INFO login_qr 开始")
	}
	if !strings.Contains(s, "login_qr_loop") || !strings.Contains(s, "saveSession") {
		t.Fatal("扫码必须跑 sidecar 并加密入库")
	}
	jobsSrc, err := os.ReadFile("jobs.go")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(jobsSrc), `slog.Info("sidecar"`) || !strings.Contains(string(jobsSrc), "logSidecarLine") {
		t.Fatal("sidecar 每一行 NDJSON 须 INFO 打到 Worker 日志")
	}
	if !strings.Contains(s, `"success"`) || !strings.Contains(s, "session_status") {
		t.Fatal("扫码成功须 SSE type=success 并写 session_status")
	}
	if !strings.Contains(s, "loginPersistCtx") || !strings.Contains(s, "stateHasSession") || !strings.Contains(s, "clearLoginActive") {
		t.Fatal("扫码成功须脱离作业 ctx 写库：有 session 文件即使 last=error 也要入库")
	}
	if !strings.Contains(s, "loginSidecarCtx") || !strings.Contains(s, "identityFromState") {
		t.Fatal("扫码 sidecar 不得绑作业 ctx；写库时无昵称也要从 state 取 uid")
	}
	if !strings.Contains(s, "LoginQRSidecarTimeout") || !strings.Contains(s, "watchLoginCancel") || !strings.Contains(s, "watchLoginSMSCode") {
		t.Fatal("扫码须 180s 级硬超时、监听取消，并把网页验证码交给同一 sidecar")
	}
	if !strings.Contains(s, `step == "sms_wait"`) || !strings.Contains(s, `step == "sms_submit"`) {
		t.Fatal("提交验证码后须续期 Redis 登录等待，避免填码后锁过期")
	}
	if !strings.Contains(s, "sidecar.IsInstalling(err)") || strings.Contains(s, "return nil\n\t}\n\treturn h.finishLoginState") {
		t.Fatal("sidecar 失败仍须尝试 finishLoginState，避免已导出的 session 没写库")
	}
	if !strings.Contains(s, "BusyLoginMessage") || !strings.Contains(s, "lockLogin") {
		t.Fatal("登录作业须用可抢占号锁并给出等待/取消文案")
	}
	if strings.Contains(s, "rejectNoDouyin") {
		t.Fatal("登录不得再走未接入 stub")
	}
	tasks, err := os.ReadFile(filepath.Join("..", "queue", "tasks.go"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(tasks), "TypeLoginQR, p, 10*time.Minute, 0") {
		t.Fatal("扫码作业失败后不得自动重试")
	}
	if !strings.Contains(string(tasks), "QueueLogin") || !strings.Contains(string(tasks), "TaskQueue") {
		t.Fatal("扫码须入队 login，且与 Worker 订阅用同一常量")
	}
	for _, name := range []string{"friends.go", "archive.go", "send.go"} {
		b, err := os.ReadFile(name)
		if err != nil {
			t.Fatal(name, err)
		}
		body := string(b)
		if strings.Contains(body, "假号") || strings.Contains(body, "spark_xxx") {
			t.Fatal(name)
		}
		if strings.Contains(body, "rejectNoDouyin") {
			t.Fatal(name + " 不得再走未接入 stub")
		}
	}
	send, _ := os.ReadFile("send.go")
	if !strings.Contains(string(send), "execSend") || !strings.Contains(string(send), "writeStateIn") {
		t.Fatal("发送必须解密会话并调用 sidecar")
	}
	if strings.Contains(string(send), `finishSend(ctx, p, "fail", d.Channel, "adapter_unavailable"`) {
		t.Fatal("发送不得再以未接入作为主路径")
	}
}
