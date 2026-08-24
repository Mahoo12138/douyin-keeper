package integration

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminSettingsRepoUpsertsAndAuditsWithoutValue(t *testing.T) {
	ctx := context.Background()
	actorID := newUser(t)
	key := "feature.test" + newUUID().String()[:8]
	want := json.RawMessage(`{"enabled":true}`)
	repo := postgres.NewAdminRepo(pool, nil)

	updated, err := repo.SetSetting(ctx, actorID, key, want)
	if err != nil {
		t.Fatalf("set setting: %v", err)
	}
	var updatedValue, expectedValue any
	if json.Unmarshal(updated.Value, &updatedValue) != nil || json.Unmarshal(want, &expectedValue) != nil {
		t.Fatalf("setting value is not JSON: %s", updated.Value)
	}
	if updated.Key != key || updatedValue.(map[string]any)["enabled"] != expectedValue.(map[string]any)["enabled"] {
		t.Fatalf("updated setting = %+v", updated)
	}

	items, err := repo.ListSettings(ctx)
	if err != nil {
		t.Fatalf("list settings: %v", err)
	}
	var found bool
	for _, item := range items {
		if item.Key == key {
			found = true
			var storedValue any
			if err := json.Unmarshal(item.Value, &storedValue); err != nil || storedValue.(map[string]any)["enabled"] != true {
				t.Fatalf("stored value = %s", item.Value)
			}
		}
	}
	if !found {
		t.Fatalf("setting %q not returned", key)
	}

	var auditDetail []byte
	if err := pool.QueryRow(ctx, `
		SELECT detail_json FROM audit_logs
		WHERE actor_user_id=$1 AND action='site_setting.update' AND resource_id=$2
		ORDER BY created_at DESC LIMIT 1`, actorID, key).Scan(&auditDetail); err != nil {
		t.Fatal(err)
	}
	var detail map[string]any
	if err := json.Unmarshal(auditDetail, &detail); err != nil || detail["key"] != key || len(detail) != 1 {
		t.Fatalf("audit detail contains unexpected value: %s", auditDetail)
	}
}
