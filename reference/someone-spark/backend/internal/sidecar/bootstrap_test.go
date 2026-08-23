package sidecar

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"huohua/internal/config"
)

func TestEnsurePythonSidecarNoPython(t *testing.T) {
	t.Cleanup(func() { setPythonReady(nil) })
	t.Setenv("HUOHUA_PY_BOOTSTRAP", "1")
	t.Setenv("HUOHUA_SIDECAR_PY", filepath.Join(t.TempDir(), "missing-python"))
	t.Setenv("PATH", "")
	cfg := &config.Config{Root: t.TempDir()}
	err := EnsurePythonSidecar(cfg)
	if !IsPythonMissing(err) {
		t.Fatalf("want ErrPythonMissing, got %v", err)
	}
	if cfg.SidecarPy != "" {
		t.Fatalf("SidecarPy should be empty, got %s", cfg.SidecarPy)
	}
	if !IsPythonMissing(PythonReady()) {
		t.Fatalf("PythonReady: %v", PythonReady())
	}
}

func TestEnsurePythonSidecarProbeOnlyUsesVenv(t *testing.T) {
	t.Cleanup(func() { setPythonReady(nil) })
	t.Setenv("HUOHUA_PY_BOOTSTRAP", "0")
	t.Setenv("HUOHUA_SIDECAR_PY", "")
	root := t.TempDir()
	venv := config.VenvPython(root)
	if err := os.MkdirAll(filepath.Dir(venv), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(venv, []byte(""), 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{Root: root}
	if err := EnsurePythonSidecar(cfg); err != nil {
		t.Fatal(err)
	}
	if cfg.SidecarPy != venv {
		t.Fatalf("want venv %s, got %s", venv, cfg.SidecarPy)
	}
}

func TestEnsurePythonSidecarProbeOnlyMissing(t *testing.T) {
	t.Cleanup(func() { setPythonReady(nil) })
	t.Setenv("HUOHUA_PY_BOOTSTRAP", "0")
	t.Setenv("HUOHUA_SIDECAR_PY", filepath.Join(t.TempDir(), "missing-python"))
	t.Setenv("PATH", "")
	cfg := &config.Config{Root: t.TempDir()}
	if err := EnsurePythonSidecar(cfg); !IsPythonMissing(err) {
		t.Fatalf("want ErrPythonMissing, got %v", err)
	}
}

func TestPythonInstallingBlocksReady(t *testing.T) {
	t.Cleanup(func() { setPythonReady(nil) })
	MarkInstalling()
	if !IsInstalling(PythonReady()) {
		t.Fatalf("want installing, got %v", PythonReady())
	}
	if CurrentStatus().State != StateInstalling {
		t.Fatalf("status %s", CurrentStatus().State)
	}
	if UserMessage(PythonReady()) != "正在安装浏览器，请稍后重试" {
		t.Fatalf("msg %s", UserMessage(PythonReady()))
	}
	setPythonReady(nil)
	if PythonReady() != nil || CurrentStatus().State != StateReady {
		t.Fatalf("ready: %v %s", PythonReady(), CurrentStatus().State)
	}
}

func TestEnsureDoesNotClearInstallingUntilDone(t *testing.T) {
	t.Cleanup(func() { setPythonReady(nil) })
	t.Setenv("HUOHUA_PY_BOOTSTRAP", "1")
	t.Setenv("HUOHUA_SIDECAR_PY", filepath.Join(t.TempDir(), "missing-python"))
	t.Setenv("PATH", "")
	MarkInstalling()
	cfg := &config.Config{Root: t.TempDir()}
	_ = EnsurePythonSidecar(cfg)
	if IsInstalling(PythonReady()) {
		t.Fatal("finished bootstrap should not stay installing")
	}
	if !IsPythonMissing(PythonReady()) {
		t.Fatalf("want missing after failed bootstrap, got %v", PythonReady())
	}
}

func TestUserMessageMapsSysLib(t *testing.T) {
	t.Cleanup(func() { RememberVenv("") })
	RememberVenv("/www/wwwroot/huohua/worker-py/.venv/bin/python")
	msg := UserMessage(errors.New("chrome-headless-shell: error while loading shared libraries: libnspr4.so: cannot open shared object file: No such file or directory"))
	if !strings.Contains(msg, "服务器缺少 Chromium 系统库") {
		t.Fatalf("syslib: %s", msg)
	}
	if strings.Contains(msg, "--no-sandbox") || strings.Contains(msg, "chrome-headless-shell:") {
		t.Fatalf("不应回传启动参数: %s", msg)
	}
	if !strings.Contains(msg, "/www/wwwroot/huohua/worker-py/.venv/bin/playwright") {
		t.Fatalf("须带探测到的 playwright: %s", msg)
	}
}

func TestInstallDepsFailureDoesNotAbortBootstrapSource(t *testing.T) {
	b, err := os.ReadFile("bootstrap.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, "install-deps") || !strings.Contains(s, "tryInstallPlaywrightDeps") {
		t.Fatal("chromium 安装后须尝试 install-deps")
	}
	if !strings.Contains(s, "系统依赖已就绪") {
		t.Fatal("已有系统库时须跳过 install-deps")
	}
	if !strings.Contains(s, "非 root 跳过") || !strings.Contains(s, "Geteuid") {
		t.Fatal("非 root 禁止调用 install-deps")
	}
	if !strings.Contains(s, "www 用户通常无 sudo") {
		t.Fatal("无 sudo 时须打中文 ERROR 且不退出")
	}
}

func TestChromiumSysLibsIn(t *testing.T) {
	dir := t.TempDir()
	if chromiumSysLibsIn([]string{dir}) {
		t.Fatal("empty dir should not be ready")
	}
	if err := os.WriteFile(filepath.Join(dir, "libnspr4.so"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}
	if chromiumSysLibsIn([]string{dir}) {
		t.Fatal("only nspr should not be ready")
	}
	if err := os.WriteFile(filepath.Join(dir, "libnss3.so.2"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}
	if !chromiumSysLibsIn([]string{dir}) {
		t.Fatal("nspr + nss should be ready")
	}
}

func TestSysLibAdminCmdUbuntu24(t *testing.T) {
	cmd := SysLibAdminCmd("/www/wwwroot/huohua/worker-py/.venv/bin/python")
	if !strings.Contains(cmd, "install-deps chromium") {
		t.Fatalf("want install-deps: %s", cmd)
	}
	if !strings.Contains(cmd, "libasound2t64") || !strings.Contains(cmd, "libatk-bridge2.0-0t64") {
		t.Fatalf("want ubuntu24 t64: %s", cmd)
	}
	if strings.Contains(cmd, "libasound2 ") || strings.HasSuffix(cmd, "libasound2") {
		t.Fatalf("不要虚拟包 libasound2: %s", cmd)
	}
	if strings.Contains(cmd, "libatk-bridge2.0-0 ") {
		t.Fatalf("不要非 t64 atk-bridge: %s", cmd)
	}
}

func TestRunLinesKillsProcessGroup(t *testing.T) {
	b, err := os.ReadFile("job.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, "prepProcessGroup") || !strings.Contains(s, "KillTree") || !strings.Contains(s, "OnStart") {
		t.Fatal("RunLines 须建进程组并在取消时杀掉 Playwright 子进程")
	}
	if !strings.Contains(s, `slog.Info("sidecar stderr"`) {
		t.Fatal("sidecar stderr 不得吞掉")
	}
	KillTree(0)
	KillTree(-1)
}

func TestGuardPythonUsesReadyErr(t *testing.T) {
	t.Cleanup(func() { setPythonReady(nil) })
	setPythonReady(ErrPythonMissing)
	if err := guardPython(RunCfg{}); !IsPythonMissing(err) {
		t.Fatalf("empty bin: %v", err)
	}
	if err := guardPython(RunCfg{Bin: "node"}); err != nil {
		t.Fatalf("node should pass: %v", err)
	}
}
