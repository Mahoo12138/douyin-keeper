package jobs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStateHasSession(t *testing.T) {
	if stateHasSession(nil) || stateHasSession([]byte("{")) {
		t.Fatal("过短或坏 JSON 不能当已登录")
	}
	ok := []byte(`{"cookies":[{"name":"sessionid","value":"abc123"},{"name":"ttwid","value":"x"}]}`)
	if !stateHasSession(ok) {
		t.Fatal("有 sessionid 应视为已登录")
	}
	empty := []byte(`{"cookies":[{"name":"sessionid","value":"  "}]}`)
	if stateHasSession(empty) {
		t.Fatal("空 sessionid 不能入库")
	}
	sidTT := []byte(`{"cookies":[{"name":"sid_tt","value":"tok"}]}`)
	if !stateHasSession(sidTT) {
		t.Fatal("sid_tt 应视为已登录")
	}
}

func TestFinishLoginStateSavesEvenIfLastError(t *testing.T) {
	b, err := os.ReadFile("login.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, "hasState := err == nil && stateHasSession(state)") {
		t.Fatal("有导出文件就必须写库，不能只看 last.type==error")
	}
	if !strings.Contains(s, "context.Background()") {
		t.Fatal("写库不得绑在已取消的作业 ctx 上")
	}
	qr, err := os.ReadFile(filepath.Join("..", "..", "..", "worker-py", "adapters", "douyin_web", "login_qr.py"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(qr)
	exp := strings.Index(body, "export_state(context, state_out)")
	ident := strings.Index(body, "public_identity(page, context)")
	if exp < 0 || ident < 0 || exp > ident {
		t.Fatal("扫到 sessionid 后须先导出 state 再取昵称，避免身份读取失败丢会话")
	}
	if !strings.Contains(body, "context.cookies()") || !strings.Contains(body, `startswith("sessionid")`) {
		t.Fatal("出码后须持续轮询 context.cookies()，sessionid 非空即成功")
	}
	if !strings.Contains(body, "_identity_visible") || !strings.Contains(body, "_extend_wait") {
		t.Fatal("扫码后须检测身份验证层并延长等待，不得立刻 180s 杀进程")
	}
}

func TestIdentityFromState(t *testing.T) {
	state := []byte(`{"cookies":[{"name":"sessionid","value":"abc"},{"name":"uid_tt","value":"u123"}]}`)
	nick, uid := identityFromState(state, "", "")
	if uid != "u123" || nick != "" {
		t.Fatalf("应从 state 取 uid，got nick=%q uid=%q", nick, uid)
	}
	nick, uid = identityFromState(state, "已有", "keep")
	if nick != "已有" || uid != "keep" {
		t.Fatal("已有身份不得被覆盖")
	}
}
