// Package integration runs repository/service integration tests against a real
// PostgreSQL (docs/14 §16). Set TEST_DATABASE_URL to enable; without it the
// whole package skips cleanly so `go test ./...` still passes on a fresh
// checkout.
package integration

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

var pool *pgxpool.Pool

const (
	testSigningKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	testPepper     = "test-refresh-pepper-64-bytes-0123456789abcdef"
	testCardPepper = "test-card-pepper-dk1-64-bytes-0123456789abcdef"
)

func TestMain(m *testing.M) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		fmt.Println("integration: TEST_DATABASE_URL not set; skipping")
		os.Exit(0)
	}
	ctx := context.Background()
	if err := ensureTestDB(url); err != nil {
		fmt.Fprintln(os.Stderr, "integration: ensure db:", err)
		os.Exit(1)
	}
	var err error
	pool, err = postgres.Connect(ctx, url)
	if err != nil {
		fmt.Fprintln(os.Stderr, "integration: connect:", err)
		os.Exit(1)
	}
	if err := postgres.Migrate(ctx, pool, slog.New(slog.NewTextHandler(os.Stderr, nil))); err != nil {
		fmt.Fprintln(os.Stderr, "integration: migrate:", err)
		os.Exit(1)
	}
	if err := resetTestData(ctx, pool); err != nil {
		fmt.Fprintln(os.Stderr, "integration: reset:", err)
		os.Exit(1)
	}
	code := m.Run()
	pool.Close()
	os.Exit(code)
}

// resetTestData makes repeated local runs deterministic without touching the
// migration ledger. TEST_DATABASE_URL is explicitly a disposable database;
// production and the developer database are never reset by this package.
func resetTestData(ctx context.Context, pool *pgxpool.Pool) error {
	var tables *string
	if err := pool.QueryRow(ctx, `
		SELECT string_agg(format('%I.%I', schemaname, tablename), ',')
		FROM pg_tables
		WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`).Scan(&tables); err != nil {
		return err
	}
	if tables == nil || *tables == "" {
		return nil
	}
	_, err := pool.Exec(ctx, "TRUNCATE TABLE "+*tables+" RESTART IDENTITY CASCADE")
	return err
}

// ensureTestDB connects to the maintenance db and creates the target database
// when missing (fresh-test motion).
func ensureTestDB(url string) error {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return err
	}
	db := cfg.ConnConfig.Database
	cfg.ConnConfig.Database = "postgres"
	maint, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		return err
	}
	defer maint.Close()
	var exists bool
	err = maint.QueryRow(context.Background(),
		`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)`, db).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		// pg_database locks the identifier; quoting is required.
		if _, err := maint.Exec(context.Background(),
			fmt.Sprintf(`CREATE DATABASE %s`, pgIdent(db))); err != nil {
			return err
		}
	}
	return nil
}

func pgIdent(s string) string {
	return `"` + s + `"`
}

func newUUID() uuid.UUID { return uuid.New() }

func newTx() *postgres.TxManager { return postgres.NewTxManager(pool) }

func mustTime(t *testing.T, s string) time.Time {
	t.Helper()
	ts, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatalf("parse time %s: %v", s, err)
	}
	return ts
}

// convenience: single-row scan into values via a fresh query (for asserting
// rows directly).
func queryRow(t *testing.T, sql string, args ...any) pgx.Row {
	t.Helper()
	return pool.QueryRow(context.Background(), sql, args...)
}
