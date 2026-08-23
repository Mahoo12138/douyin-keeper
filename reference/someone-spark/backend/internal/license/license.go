// Package license 是站长授权预留层。
// V1 恒返回 valid（always-valid stub）。实现真授权时只改本包，不要把校验散落到登录/扣款/Playwright。
// 设计见 docs/02-M0-设计冻结/10-站长授权预留.md。
package license

import (
	"log/slog"

	"huohua/internal/config"
)

type Status struct {
	Valid  bool   `json:"valid"`
	Reason string `json:"reason"`
}

// Check V1：忽略授权文件内容，始终视为有效。禁止在本函数里卡死启动。
func Check(cfg *config.Config) Status {
	if cfg != nil && cfg.LicenseFile != "" {
		slog.Info("license stub: HUOHUA_LICENSE_FILE 已配置但 V1 不校验", "path", cfg.LicenseFile)
	}
	return Status{Valid: true, Reason: "stub-always-valid"}
}
