package sidecar

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"huohua/internal/config"
)

const playwrightDirMode = 0o770

func PreparePlaywright(root string) (string, error) {
	p, err := ensureBrowsersDir(root)
	if err != nil {
		return "", err
	}
	if home := sidecarHome(root); home != "" {
		if err := mkdirPlaywright(home); err != nil {
			return p, fmt.Errorf("创建 sidecar HOME 失败：%w。请将 worker-py 与 var 属主改为运行用户后重启 huohua-worker", err)
		}
	}
	slog.Info("Playwright browsers 目录", "path", p)
	return p, nil
}

func applySidecarEnv(root string, env []string) []string {
	if len(env) == 0 {
		env = append([]string{}, os.Environ()...)
	} else {
		env = append([]string{}, env...)
	}
	p, err := ensureBrowsersDir(root)
	if err != nil {
		p = browsersPath(root)
	}
	env = putEnv(env, "PLAYWRIGHT_BROWSERS_PATH", p)
	if home := sidecarHome(root); home != "" {
		_ = mkdirPlaywright(home)
		env = putEnv(env, "HOME", home)
	}
	return env
}

func browsersPath(root string) string {
	return config.ResolveUnder(root, strings.TrimSpace(os.Getenv("PLAYWRIGHT_BROWSERS_PATH")), filepath.Join("worker-py", ".ms-playwright"))
}

func fallbackBrowsersPath(root string) string {
	return config.ResolveUnder(root, "", filepath.Join("var", "ms-playwright"))
}

func ensureBrowsersDir(root string) (string, error) {
	if v := strings.TrimSpace(os.Getenv("PLAYWRIGHT_BROWSERS_PATH")); v != "" {
		p := config.ResolveUnder(root, v, "")
		if err := mkdirPlaywright(p); err != nil {
			return "", fmt.Errorf("创建 Playwright browsers 目录失败：%w", err)
		}
		return p, nil
	}
	prefer := browsersPath(root)
	if err := mkdirPlaywright(prefer); err == nil && isWritableDir(prefer) {
		return prefer, nil
	}
	fallback := fallbackBrowsersPath(root)
	if err := mkdirPlaywright(fallback); err != nil {
		return "", fmt.Errorf("创建 Playwright browsers 目录失败：%w。请将 worker-py 与 var 属主改为运行用户后重启 huohua-worker", err)
	}
	return fallback, nil
}

func sidecarHome(root string) string {
	if v := strings.TrimSpace(os.Getenv("HUOHUA_SIDECAR_HOME")); v != "" {
		return config.ResolveUnder(root, v, "")
	}
	home := strings.TrimSpace(os.Getenv("HOME"))
	if home != "" && !isRootHome(home) && isWritableDir(home) {
		return ""
	}
	workerPy := config.ResolveUnder(root, "", "worker-py")
	if err := os.MkdirAll(workerPy, playwrightDirMode); err == nil && isWritableDir(workerPy) {
		return workerPy
	}
	return config.ResolveUnder(root, "", filepath.Join("var", "home-www"))
}

func isRootHome(home string) bool {
	h := strings.TrimRight(strings.ReplaceAll(home, "\\", "/"), "/")
	return h == "/root"
}

func mkdirPlaywright(dir string) error {
	if err := os.MkdirAll(dir, playwrightDirMode); err != nil {
		return err
	}
	_ = os.Chmod(dir, playwrightDirMode)
	return nil
}

func isWritableDir(dir string) bool {
	if dir == "" {
		return false
	}
	st, err := os.Stat(dir)
	if err != nil || !st.IsDir() {
		return false
	}
	f, err := os.CreateTemp(dir, ".hw-w-*")
	if err != nil {
		return false
	}
	name := f.Name()
	_ = f.Close()
	_ = os.Remove(name)
	return true
}

func putEnv(env []string, key, val string) []string {
	prefix := key + "="
	out := make([]string, 0, len(env)+1)
	found := false
	for _, e := range env {
		if strings.HasPrefix(e, prefix) {
			if !found {
				out = append(out, prefix+val)
				found = true
			}
			continue
		}
		out = append(out, e)
	}
	if !found {
		out = append(out, prefix+val)
	}
	return out
}
