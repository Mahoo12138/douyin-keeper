package postgres

import (
	"context"
	"testing"
)

func TestLatestMigrationVersionMatchesEmbeddedSchema(t *testing.T) {
	version, err := LatestMigrationVersion()
	if err != nil {
		t.Fatal(err)
	}
	if version != "000009_job_idempotency.sql" {
		t.Fatalf("latest migration = %q", version)
	}
}

func TestCheckSchemaReadyRejectsMissingPool(t *testing.T) {
	if err := CheckSchemaReady(context.Background(), nil); err == nil {
		t.Fatal("nil pool should not be ready")
	}
}
