package sidecar

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/redis/go-redis/v9"
)

const (
	StateInstalling = "installing"
	StateReady      = "ready"
	StateError      = "error"
	StatusKey       = "sidecar:python:status"
	statusTTL       = 45 * time.Second
)

type Status struct {
	State   string `json:"state"`
	Message string `json:"message"`
}

func CurrentStatus() Status {
	pyReadyMu.Lock()
	defer pyReadyMu.Unlock()
	if pyInstalling {
		return Status{State: StateInstalling, Message: ErrPythonInstalling.Error()}
	}
	if pyReadyErr != nil {
		return Status{State: StateError, Message: UserMessage(pyReadyErr)}
	}
	return Status{State: StateReady}
}

func (s Status) Ready() bool {
	return s.State == StateReady
}

func ReportStatus(ctx context.Context, rdb *redis.Client) {
	if rdb == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	b, err := json.Marshal(CurrentStatus())
	if err != nil {
		return
	}
	_ = rdb.Set(ctx, StatusKey, b, statusTTL).Err()
}

func ReadReportedStatus(ctx context.Context, rdb *redis.Client) Status {
	if rdb == nil {
		return Status{}
	}
	if ctx == nil {
		ctx = context.Background()
	}
	raw, err := rdb.Get(ctx, StatusKey).Bytes()
	if err != nil || len(raw) == 0 {
		return Status{}
	}
	var st Status
	if json.Unmarshal(raw, &st) != nil {
		return Status{}
	}
	return st
}

var (
	venvMu     sync.Mutex
	lastVenvPy string
)

func RememberVenv(venvPy string) {
	venvMu.Lock()
	lastVenvPy = strings.TrimSpace(venvPy)
	venvMu.Unlock()
}

func KnownVenv() string {
	venvMu.Lock()
	defer venvMu.Unlock()
	return lastVenvPy
}

func SysLibAdminCmd(venvPy string) string {
	if strings.TrimSpace(venvPy) == "" {
		venvPy = KnownVenv()
	}
	pw := ".venv/bin/playwright"
	if strings.TrimSpace(venvPy) != "" {
		pw = filepath.ToSlash(playwrightCLI(venvPy))
	}
	apt := "sudo apt-get install -y libnspr4 libnss3 libatk-bridge2.0-0t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2"
	return fmt.Sprintf("sudo %s install-deps chromium；或 %s", pw, apt)
}

func SysLibHint(venvPy string) string {
	return "服务器缺少 Chromium 系统库，请管理员执行：" + SysLibAdminCmd(venvPy)
}

func IsSysLibMissing(msg string) bool {
	s := strings.ToLower(msg)
	return strings.Contains(s, "libnspr4") ||
		strings.Contains(s, "libnss3") ||
		strings.Contains(s, "cannot open shared object file") ||
		strings.Contains(s, "error while loading shared libraries")
}

func UserMessage(err error) string {
	if err == nil {
		return "浏览器组件失败"
	}
	if IsInstalling(err) {
		return ErrPythonInstalling.Error()
	}
	msg := strings.TrimSpace(err.Error())
	if msg == "" {
		return "浏览器组件失败"
	}
	if i := strings.Index(msg, "服务器缺少 Chromium 系统库"); i >= 0 {
		return clipUser(msg[i:])
	}
	if IsSysLibMissing(msg) {
		return SysLibHint("")
	}
	if strings.Contains(msg, "--no-sandbox") || strings.Contains(msg, "chrome-headless-shell") {
		return "浏览器启动失败。若日志含 libnspr4 / shared object，" + SysLibHint("")
	}
	if hasHan(msg) {
		return clipUser(msg)
	}
	return "浏览器组件失败：" + clipUser(msg)
}

func clipUser(s string) string {
	s = strings.TrimSpace(s)
	if len(s) <= 360 {
		return s
	}
	return s[:360] + "…"
}

func hasHan(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}
