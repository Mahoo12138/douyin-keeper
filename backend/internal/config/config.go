// Package config loads grouped runtime configuration from the environment
// (docs/14 §14). Secrets are never read from files or defaults — they must be
// injected via env / secret manager.
package config

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr    string
	MetricsAddr string
	DatabaseURL string
	RedisAddr   string

	// TrustedProxyCIDRs limits which peers may provide X-Forwarded-* headers.
	// An empty value means direct TLS/RemoteAddr are used without trusting any
	// forwarded proxy metadata.
	TrustedProxyCIDRs string

	// Auth (docs/13)
	AuthAccessTTL     time.Duration
	AuthRefreshTTL    time.Duration
	AuthSigningKey    string
	AuthRefreshPepper string

	// Crypto (docs/09 session envelope)
	SessionMasterKey string
	SessionTempDir   string
	LoginProfileDir  string

	// Browser adapter (docs/10)
	PlaywrightSidecarCommand string
	PlaywrightSidecarScript  string
	BrowserConcurrency       int
	MaxGlobalBrowsers        int
	BrowserSemaphoreTTL      time.Duration

	// Entitlement card codes (docs/12)
	CardCodePepperDK1 string

	// WeChat mini program (optional; real exchange is enabled when both are set)
	WechatAppID                  string
	WechatAppSecret              string
	WechatNotificationTemplateID string
	WechatNotificationPage       string
	WechatNotificationTitleField string
	WechatNotificationBodyField  string

	// Scheduler / outbox (docs/15)
	OutboxBatchSize    int
	OutboxPollInterval time.Duration
	ScheduleBatchSize  int
	ScheduleInterval   time.Duration
}

func env(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func Load() *Config {
	return &Config{
		HTTPAddr:          env("HTTP_ADDR", ":8080"),
		MetricsAddr:       env("METRICS_ADDR", ":9090"),
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		RedisAddr:         env("REDIS_ADDR", "localhost:6379"),
		TrustedProxyCIDRs: env("TRUSTED_PROXY_CIDRS", ""),

		AuthAccessTTL:     dur("AUTH_ACCESS_TTL", 15*time.Minute),
		AuthRefreshTTL:    dur("AUTH_REFRESH_TTL", 30*24*time.Hour),
		AuthSigningKey:    os.Getenv("AUTH_SIGNING_KEY"),
		AuthRefreshPepper: os.Getenv("AUTH_REFRESH_PEPPER"),

		SessionMasterKey:         os.Getenv("SESSION_MASTER_KEY"),
		SessionTempDir:           env("SESSION_TEMP_DIR", "/tmp/douyin-keeper/session"),
		LoginProfileDir:          env("LOGIN_PROFILE_DIR", "/tmp/douyin-keeper/login"),
		PlaywrightSidecarCommand: env("PLAYWRIGHT_SIDECAR_COMMAND", "python3"),
		PlaywrightSidecarScript:  env("PLAYWRIGHT_SIDECAR_SCRIPT", "sidecars/playwright/sidecar.py"),
		BrowserConcurrency:       positiveIntEnv("WORKER_BROWSER_CONCURRENCY", 3),
		MaxGlobalBrowsers:        positiveIntEnv("MAX_GLOBAL_BROWSERS", 3),
		BrowserSemaphoreTTL:      positiveDur("BROWSER_SEMAPHORE_TTL", 2*time.Minute),

		CardCodePepperDK1: os.Getenv("CARD_CODE_PEPPER_DK1"),

		WechatAppID:                  os.Getenv("WECHAT_APP_ID"),
		WechatAppSecret:              os.Getenv("WECHAT_APP_SECRET"),
		WechatNotificationTemplateID: os.Getenv("WECHAT_NOTIFICATION_TEMPLATE_ID"),
		WechatNotificationPage:       env("WECHAT_NOTIFICATION_PAGE", "pages/index/index"),
		WechatNotificationTitleField: env("WECHAT_NOTIFICATION_TITLE_FIELD", "thing1"),
		WechatNotificationBodyField:  env("WECHAT_NOTIFICATION_BODY_FIELD", "thing2"),

		OutboxBatchSize:    intEnv("OUTBOX_BATCH_SIZE", 100),
		OutboxPollInterval: dur("OUTBOX_POLL_INTERVAL", 5*time.Second),
		ScheduleBatchSize:  intEnv("SCHEDULE_BATCH_SIZE", 100),
		ScheduleInterval:   dur("SCHEDULE_INTERVAL", 30*time.Second),
	}
}

// TrustedProxyNetworks parses the configured peer networks used to trust
// X-Forwarded-Proto and X-Forwarded-For. Both CIDR notation and single IPs
// are accepted so local reverse-proxy deployments stay easy to configure.
func (c *Config) TrustedProxyNetworks() ([]*net.IPNet, error) {
	value := strings.TrimSpace(c.TrustedProxyCIDRs)
	if value == "" {
		return nil, nil
	}

	parts := strings.Split(value, ",")
	networks := make([]*net.IPNet, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			return nil, fmt.Errorf("invalid TRUSTED_PROXY_CIDRS: empty entry")
		}
		if ip := net.ParseIP(part); ip != nil {
			bits := 128
			if ip.To4() != nil {
				ip = ip.To4()
				bits = 32
			}
			networks = append(networks, &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)})
			continue
		}
		_, network, err := net.ParseCIDR(part)
		if err != nil {
			return nil, fmt.Errorf("invalid TRUSTED_PROXY_CIDRS entry %q: %w", part, err)
		}
		networks = append(networks, network)
	}
	return networks, nil
}

func dur(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func intEnv(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func positiveIntEnv(key string, def int) int {
	value := intEnv(key, def)
	if value <= 0 {
		return def
	}
	return value
}

func positiveDur(key string, def time.Duration) time.Duration {
	value := dur(key, def)
	if value <= 0 {
		return def
	}
	return value
}

// Require verifies that the given named settings are set. Call the groups the
// current cmd actually needs, e.g. "database", "redis", "auth", "crypto",
// "card".
func (c *Config) Require(groups ...string) error {
	required := map[string]string{}
	for _, g := range groups {
		switch g {
		case "database":
			required["DATABASE_URL"] = c.DatabaseURL
		case "redis":
			required["REDIS_ADDR"] = c.RedisAddr
		case "auth":
			required["AUTH_SIGNING_KEY"] = c.AuthSigningKey
			required["AUTH_REFRESH_PEPPER"] = c.AuthRefreshPepper
		case "crypto":
			required["SESSION_MASTER_KEY"] = c.SessionMasterKey
		case "card":
			required["CARD_CODE_PEPPER_DK1"] = c.CardCodePepperDK1
		case "wechat":
			required["WECHAT_APP_ID"] = c.WechatAppID
			required["WECHAT_APP_SECRET"] = c.WechatAppSecret
		default:
			return fmt.Errorf("config: unknown requirement group %q", g)
		}
	}
	for name, v := range required {
		if v == "" {
			return fmt.Errorf("config: required env %s is not set", name)
		}
	}
	return nil
}
