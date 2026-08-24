// Package config loads grouped runtime configuration from the environment
// (docs/14 §14). Secrets are never read from files or defaults — they must be
// injected via env / secret manager.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr    string
	DatabaseURL string
	RedisAddr   string

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

	// Entitlement card codes (docs/12)
	CardCodePepperDK1 string

	// WeChat mini program (stub until M4)
	WechatAppID     string
	WechatAppSecret string

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
		HTTPAddr:    env("HTTP_ADDR", ":8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		RedisAddr:   env("REDIS_ADDR", "localhost:6379"),

		AuthAccessTTL:     dur("AUTH_ACCESS_TTL", 15*time.Minute),
		AuthRefreshTTL:    dur("AUTH_REFRESH_TTL", 30*24*time.Hour),
		AuthSigningKey:    os.Getenv("AUTH_SIGNING_KEY"),
		AuthRefreshPepper: os.Getenv("AUTH_REFRESH_PEPPER"),

		SessionMasterKey:         os.Getenv("SESSION_MASTER_KEY"),
		SessionTempDir:           env("SESSION_TEMP_DIR", "/tmp/douyin-keeper/session"),
		LoginProfileDir:          env("LOGIN_PROFILE_DIR", "/tmp/douyin-keeper/login"),
		PlaywrightSidecarCommand: env("PLAYWRIGHT_SIDECAR_COMMAND", "python3"),
		PlaywrightSidecarScript:  env("PLAYWRIGHT_SIDECAR_SCRIPT", "sidecars/playwright/sidecar.py"),

		CardCodePepperDK1: os.Getenv("CARD_CODE_PEPPER_DK1"),

		WechatAppID:     os.Getenv("WECHAT_APP_ID"),
		WechatAppSecret: os.Getenv("WECHAT_APP_SECRET"),

		OutboxBatchSize:    intEnv("OUTBOX_BATCH_SIZE", 100),
		OutboxPollInterval: dur("OUTBOX_POLL_INTERVAL", 5*time.Second),
		ScheduleBatchSize:  intEnv("SCHEDULE_BATCH_SIZE", 100),
		ScheduleInterval:   dur("SCHEDULE_INTERVAL", 30*time.Second),
	}
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
