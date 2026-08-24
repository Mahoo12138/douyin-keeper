package config

import (
	"testing"
	"time"
)

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
