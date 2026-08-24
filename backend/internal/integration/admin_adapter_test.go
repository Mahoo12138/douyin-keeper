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

	items, err := repo.ListAdapterHealth(ctx)
	if err != nil || len(items) != 3 {
		t.Fatalf("adapter list = %+v, err = %v", items, err)
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
