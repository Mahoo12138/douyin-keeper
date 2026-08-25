package integration

import (
	"context"
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminAdapterRepoListsAndAuditsToggle(t *testing.T) {
	ctx := context.Background()
	actorID := newUser(t)
	repo := postgres.NewAdminRepo(pool, nil)
	repo.SetBrowserSlotsLimit(7)
	repo.SetBrowserConcurrency(5)
	runtime, err := repo.GetRuntimeSummary(ctx)
	if err != nil || runtime.BrowserSlotsLimit != 7 {
		t.Fatalf("browser slot limit = %d, err = %v", runtime.BrowserSlotsLimit, err)
	}
	for _, pool := range runtime.Pools {
		if pool.Name == "browser" && pool.Concurrency != 5 {
			t.Fatalf("browser pool concurrency = %d", pool.Concurrency)
		}
	}

	items, err := repo.ListAdapterHealth(ctx)
	if err != nil || len(items) != 3 {
		t.Fatalf("adapter list = %+v, err = %v", items, err)
	}
	for _, item := range items {
		if item.Name == "protocol.im" && item.Executable {
			t.Fatalf("protocol adapter should be disabled in the default catalog: %+v", item)
		}
	}
	repo.SetAdapterExecutable("protocol.im", true)
	items, err = repo.ListAdapterHealth(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item.Name == "protocol.im" && !item.Executable {
			t.Fatalf("verified protocol adapter should be executable: %+v", item)
		}
	}

	if _, err := repo.SetAdapterEnabled(ctx, actorID, "browser.consumer", false); err != nil {
		t.Fatalf("disable adapter: %v", err)
	}
	defer func() {
		if _, err := repo.SetAdapterEnabled(ctx, actorID, "browser.consumer", true); err != nil {
			t.Errorf("restore adapter: %v", err)
		}
	}()

	items, err = repo.ListAdapterHealth(ctx)
	if err != nil || len(items) != 3 {
		t.Fatalf("adapter list after disable = %+v, err = %v", items, err)
	}
	for _, item := range items {
		if item.Name == "browser.consumer" {
			if item.Status != "disabled" || item.Enabled {
				t.Fatalf("disabled adapter = %+v", item)
			}
		}
	}

	var auditCount int
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM audit_logs
		WHERE actor_user_id=$1 AND action='adapter.disable' AND resource_id='browser.consumer'`, actorID).Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if auditCount < 1 {
		t.Fatalf("adapter disable audit count = %d", auditCount)
	}
	restored, err := repo.SetAdapterEnabled(ctx, actorID, "browser.consumer", true)
	if err != nil || restored.Status != "unknown" || !restored.Enabled {
		t.Fatalf("enabled adapter should await a fresh probe: %+v, err = %v", restored, err)
	}
}
