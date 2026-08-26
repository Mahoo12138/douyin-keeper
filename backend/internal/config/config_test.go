package config

import (
	"net"
	"testing"
	"time"
)

func TestTrustedProxyNetworksParsesCIDRsAndIPs(t *testing.T) {
	cfg := &Config{TrustedProxyCIDRs: "10.0.0.0/8, 192.0.2.10"}
	networks, err := cfg.TrustedProxyNetworks()
	if err != nil || len(networks) != 2 {
		t.Fatalf("trusted proxy networks = %v, err = %v", networks, err)
	}
	if !networks[0].Contains(net.ParseIP("10.1.2.3")) || networks[0].Contains(net.ParseIP("11.1.2.3")) {
		t.Fatal("CIDR network parsed incorrectly")
	}
	if !networks[1].Contains(net.ParseIP("192.0.2.10")) || networks[1].Contains(net.ParseIP("192.0.2.11")) {
		t.Fatal("single IP network parsed incorrectly")
	}
}

func TestTrustedProxyNetworksRejectsInvalidEntries(t *testing.T) {
	for _, value := range []string{"not-an-ip", "10.0.0.0/", "10.0.0.0/8,,192.0.2.1"} {
		if _, err := (&Config{TrustedProxyCIDRs: value}).TrustedProxyNetworks(); err == nil {
			t.Fatalf("invalid proxy value %q should fail", value)
		}
	}
}

func TestLoadBrowserConcurrencyConfig(t *testing.T) {
	t.Setenv("WORKER_BROWSER_CONCURRENCY", "5")
	t.Setenv("MAX_GLOBAL_BROWSERS", "7")
	t.Setenv("BROWSER_SEMAPHORE_TTL", "45s")

	cfg := Load()
	if cfg.BrowserConcurrency != 5 || cfg.MaxGlobalBrowsers != 7 {
		t.Fatalf("browser config = (%d, %d), want (5, 7)", cfg.BrowserConcurrency, cfg.MaxGlobalBrowsers)
	}
	if cfg.BrowserSemaphoreTTL != 45*time.Second {
		t.Fatalf("semaphore ttl = %s, want 45s", cfg.BrowserSemaphoreTTL)
	}
}

func TestLoadBrowserConcurrencyConfigFallsBackForNonPositiveValues(t *testing.T) {
	t.Setenv("WORKER_BROWSER_CONCURRENCY", "0")
	t.Setenv("MAX_GLOBAL_BROWSERS", "-1")
	t.Setenv("BROWSER_SEMAPHORE_TTL", "-1s")

	cfg := Load()
	if cfg.BrowserConcurrency != 3 || cfg.MaxGlobalBrowsers != 3 || cfg.BrowserSemaphoreTTL != 2*time.Minute {
		t.Fatalf("invalid browser config did not fall back to defaults: %+v", cfg)
	}
}

func TestLoadProtocolBundleConfig(t *testing.T) {
	t.Setenv("PROTOCOL_SIDECAR_COMMAND", "nodejs")
	t.Setenv("PROTOCOL_SIDECAR_BUNDLE_DIR", "/opt/keeper/protocol")

	cfg := Load()
	if cfg.ProtocolSidecarCommand != "nodejs" || cfg.ProtocolBundleDir != "/opt/keeper/protocol" {
		t.Fatalf("protocol bundle config = (%q, %q)", cfg.ProtocolSidecarCommand, cfg.ProtocolBundleDir)
	}
}

func TestLoadRuntimeConfigFallsBackForNonPositiveValues(t *testing.T) {
	for key, value := range map[string]string{
		"AUTH_ACCESS_TTL":      "0s",
		"AUTH_REFRESH_TTL":     "-1h",
		"OUTBOX_BATCH_SIZE":    "0",
		"OUTBOX_POLL_INTERVAL": "0s",
		"SCHEDULE_BATCH_SIZE":  "-10",
		"SCHEDULE_INTERVAL":    "-1s",
	} {
		t.Setenv(key, value)
	}

	cfg := Load()
	if cfg.AuthAccessTTL != 15*time.Minute || cfg.AuthRefreshTTL != 30*24*time.Hour {
		t.Fatalf("auth TTL config did not fall back to defaults: access=%s refresh=%s", cfg.AuthAccessTTL, cfg.AuthRefreshTTL)
	}
	if cfg.OutboxBatchSize != 100 || cfg.ScheduleBatchSize != 100 {
		t.Fatalf("scheduler batch config did not fall back to defaults: outbox=%d schedule=%d", cfg.OutboxBatchSize, cfg.ScheduleBatchSize)
	}
	if cfg.OutboxPollInterval != 5*time.Second || cfg.ScheduleInterval != 30*time.Second {
		t.Fatalf("scheduler interval config did not fall back to defaults: outbox=%s schedule=%s", cfg.OutboxPollInterval, cfg.ScheduleInterval)
	}
}

func TestLoadRuntimeConfigKeepsPositiveValues(t *testing.T) {
	t.Setenv("AUTH_ACCESS_TTL", "45s")
	t.Setenv("AUTH_REFRESH_TTL", "12h")
	t.Setenv("OUTBOX_BATCH_SIZE", "17")
	t.Setenv("OUTBOX_POLL_INTERVAL", "750ms")
	t.Setenv("SCHEDULE_BATCH_SIZE", "23")
	t.Setenv("SCHEDULE_INTERVAL", "2m")

	cfg := Load()
	if cfg.AuthAccessTTL != 45*time.Second || cfg.AuthRefreshTTL != 12*time.Hour {
		t.Fatalf("positive auth TTL config changed unexpectedly: access=%s refresh=%s", cfg.AuthAccessTTL, cfg.AuthRefreshTTL)
	}
	if cfg.OutboxBatchSize != 17 || cfg.ScheduleBatchSize != 23 {
		t.Fatalf("positive scheduler batch config changed unexpectedly: outbox=%d schedule=%d", cfg.OutboxBatchSize, cfg.ScheduleBatchSize)
	}
	if cfg.OutboxPollInterval != 750*time.Millisecond || cfg.ScheduleInterval != 2*time.Minute {
		t.Fatalf("positive scheduler interval config changed unexpectedly: outbox=%s schedule=%s", cfg.OutboxPollInterval, cfg.ScheduleInterval)
	}
}
