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
