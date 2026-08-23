package sidecar

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"huohua/internal/config"
)

const (
	venvTimeout       = 60 * time.Second
	pipTimeout        = 5 * time.Minute
	playwrightTimeout = 10 * time.Minute
)

var ErrPythonMissing = errors.New("未找到 Python 可执行文件（已探测 HUOHUA_SIDECAR_PY、部署根 worker-py/.venv/bin/python、python3、python）。请由管理员执行 apt/yum/dnf install python3 python3-venv（宝塔 www 用户无权限，Worker 不会也不能 sudo 装包）。装好后重启 huohua-worker")
var ErrPythonInstalling = errors.New("正在安装浏览器，请稍后重试")

var (
	pyReadyMu    sync.Mutex
	pyReadyErr   error
	pyInstalling = true
)

func IsPythonMissing(err error) bool {
	return errors.Is(err, ErrPythonMissing)
}

func IsInstalling(err error) bool {
	return errors.Is(err, ErrPythonInstalling)
}

func PythonReady() error {
	pyReadyMu.Lock()
	defer pyReadyMu.Unlock()
	if pyInstalling {
		return ErrPythonInstalling
	}
	return pyReadyErr
}

func MarkInstalling() {
	pyReadyMu.Lock()
	pyInstalling = true
	pyReadyErr = nil
	pyReadyMu.Unlock()
}

func setPythonReady(err error) {
	pyReadyMu.Lock()
	pyInstalling = false
	pyReadyErr = err
	pyReadyMu.Unlock()
}

func pyBootstrapEnabled() bool {
	return strings.TrimSpace(os.Getenv("HUOHUA_PY_BOOTSTRAP")) != "0"
}

func EnsurePythonSidecar(cfg *config.Config) error {
	MarkInstalling()
	if cfg == nil {
		err := fmt.Errorf("python sidecar: 配置为空")
		setPythonReady(err)
		return err
	}
	if _, err := PreparePlaywright(cfg.Root); err != nil {
		setPythonReady(err)
		return err
	}
	if !pyBootstrapEnabled() {
		cfg.SidecarPy = config.ResolvePython(cfg.Root)
		if cfg.SidecarPy == "" {
			setPythonReady(ErrPythonMissing)
			return ErrPythonMissing
		}
		RememberVenv(cfg.SidecarPy)
		slog.Info("Python sidecar 探测完成（已关闭自动安装）", "python", cfg.SidecarPy)
		return nil
	}
	venvPy := config.VenvPython(cfg.Root)
	workerPy := config.ResolveUnder(cfg.Root, "", "worker-py")
	if !config.FileExists(venvPy) {
		seed := config.SeedPython(cfg.Root)
		if seed == "" {
			cfg.SidecarPy = ""
			setPythonReady(ErrPythonMissing)
			return ErrPythonMissing
		}
		slog.Info("正在创建 Python venv", "python", seed, "dir", filepath.Join(workerPy, ".venv"))
		if err := runTimed(venvTimeout, cfg.Root, workerPy, seed, "-m", "venv", ".venv"); err != nil {
			err = fmt.Errorf("创建 worker-py/.venv 失败：%w。请由管理员安装 python3-venv（如 apt install python3-venv 或 yum/dnf install python3），然后重启 huohua-worker", err)
			cfg.SidecarPy = ""
			setPythonReady(err)
			return err
		}
		if !config.FileExists(venvPy) {
			err := fmt.Errorf("已执行 python -m venv，但仍找不到 %s。请由管理员安装 python3-venv 后重启 huohua-worker", venvPy)
			cfg.SidecarPy = ""
			setPythonReady(err)
			return err
		}
	}
	if err := installVenvDeps(cfg.Root, venvPy); err != nil {
		cfg.SidecarPy = ""
		setPythonReady(err)
		return err
	}
	cfg.SidecarPy = venvPy
	RememberVenv(venvPy)
	setPythonReady(nil)
	slog.Info("Python sidecar 就绪", "python", venvPy)
	return nil
}

func installVenvDeps(root, venvPy string) error {
	workerPy := config.ResolveUnder(root, "", "worker-py")
	req := filepath.Join(workerPy, "requirements.txt")
	if !config.FileExists(req) {
		return fmt.Errorf("找不到 %s，无法安装 Python 依赖", req)
	}
	slog.Info("正在安装 Python 依赖", "req", req)
	if err := runTimed(pipTimeout, root, workerPy, venvPy, "-m", "pip", "install", "-r", "requirements.txt"); err != nil {
		return fmt.Errorf("安装 Python 依赖失败：%w。请确认服务器能访问外网", err)
	}
	pwPath, err := ensureBrowsersDir(root)
	if err != nil {
		return err
	}
	slog.Info("正在安装 Playwright Chromium", "path", pwPath)
	if err := runTimed(playwrightTimeout, root, workerPy, venvPy, "-m", "playwright", "install", "chromium"); err != nil {
		return fmt.Errorf("安装 Playwright Chromium 失败：%w。请确认能访问外网；缺系统库时由管理员在服务器执行 .venv/bin/playwright install-deps chromium", err)
	}
	tryInstallPlaywrightDeps(root, venvPy)
	slog.Info("Python sidecar 依赖已就绪")
	return nil
}

func playwrightCLI(venvPy string) string {
	dir := filepath.Dir(venvPy)
	if runtime.GOOS == "windows" {
		return filepath.Join(dir, "playwright.exe")
	}
	return filepath.Join(dir, "playwright")
}

var chromiumSysLibNames = []string{"libnspr4.so", "libnss3.so"}

var chromiumSysLibDirs = []string{
	"/usr/lib/x86_64-linux-gnu",
	"/lib/x86_64-linux-gnu",
	"/usr/lib/aarch64-linux-gnu",
	"/lib/aarch64-linux-gnu",
	"/usr/lib64",
	"/usr/lib",
	"/lib64",
	"/lib",
}

func tryInstallPlaywrightDeps(root, venvPy string) {
	RememberVenv(venvPy)
	if runtime.GOOS != "linux" {
		return
	}
	if chromiumSysLibsReady() {
		slog.Info("系统依赖已就绪")
		return
	}
	if os.Geteuid() != 0 {
		slog.Info("非 root 跳过 install-deps")
		slog.Error("Playwright 系统依赖未装上。www 用户通常无 sudo，Worker 不会因此退出。请管理员执行：" + SysLibAdminCmd(venvPy))
		return
	}
	workerPy := config.ResolveUnder(root, "", "worker-py")
	pw := playwrightCLI(venvPy)
	slog.Info("尝试安装 Playwright 系统依赖", "cli", pw)
	if err := runTimed(playwrightTimeout, root, workerPy, venvPy, "-m", "playwright", "install-deps", "chromium"); err != nil {
		slog.Error("Playwright 系统依赖未装上。www 用户通常无 sudo，Worker 不会因此退出。请管理员执行：" + SysLibAdminCmd(venvPy))
		slog.Error("install-deps 失败详情", "err", err)
		return
	}
	slog.Info("Playwright 系统依赖已安装")
}

func chromiumSysLibsReady() bool {
	return chromiumSysLibsIn(chromiumSysLibDirs) || ldconfigHasChromiumSysLibs()
}

func chromiumSysLibsIn(dirs []string) bool {
	for _, name := range chromiumSysLibNames {
		if !sysLibInDirs(name, dirs) {
			return false
		}
	}
	return true
}

func sysLibInDirs(name string, dirs []string) bool {
	for _, dir := range dirs {
		if config.FileExists(filepath.Join(dir, name)) {
			return true
		}
		matches, err := filepath.Glob(filepath.Join(dir, name+"*"))
		if err == nil && len(matches) > 0 {
			return true
		}
	}
	return false
}

func ldconfigHasChromiumSysLibs() bool {
	out := ldconfigCache()
	if out == "" {
		return false
	}
	for _, name := range chromiumSysLibNames {
		if !strings.Contains(out, name) {
			return false
		}
	}
	return true
}

func ldconfigCache() string {
	for _, bin := range []string{"ldconfig", "/sbin/ldconfig", "/usr/sbin/ldconfig"} {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		cmd := exec.CommandContext(ctx, bin, "-p")
		var out bytes.Buffer
		cmd.Stdout = &out
		err := cmd.Run()
		cancel()
		if err == nil && out.Len() > 0 {
			return out.String()
		}
	}
	return ""
}

func runTimed(timeout time.Duration, root, dir, bin string, args ...string) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = dir
	cmd.Env = applySidecarEnv(root, nil)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	msg := clip(out.String(), 800)
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return fmt.Errorf("超时 %s：%s", timeout, msg)
		}
		return fmt.Errorf("%v: %s", err, msg)
	}
	return nil
}

func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
