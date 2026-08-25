package postgres

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// LatestMigrationVersion returns the newest embedded migration required by
// this binary. Readiness uses the same source as Migrate so the two checks
// cannot drift when a new migration is added.
func LatestMigrationVersion() (string, error) {
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return "", fmt.Errorf("migrate: read dir: %w", err)
	}
	latest := ""
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") && entry.Name() > latest {
			latest = entry.Name()
		}
	}
	if latest == "" {
		return "", fmt.Errorf("migrate: no migration files found")
	}
	return latest, nil
}

// CheckSchemaReady verifies that the database has applied the newest
// migration embedded in this binary. It deliberately accepts newer schema
// versions so rolling deployments can start after a forward migration has
// already been applied.
func CheckSchemaReady(ctx context.Context, pool *pgxpool.Pool) error {
	if pool == nil {
		return fmt.Errorf("migrate: database pool is not configured")
	}
	required, err := LatestMigrationVersion()
	if err != nil {
		return err
	}
	var applied bool
	if err := pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, required).Scan(&applied); err != nil {
		if err == pgx.ErrNoRows {
			return fmt.Errorf("migrate: schema_migrations is not initialized")
		}
		return fmt.Errorf("migrate: check required version %s: %w", required, err)
	}
	if !applied {
		return fmt.Errorf("migrate: required schema version %s is not applied", required)
	}
	return nil
}

// Migrate applies all embedded migrations in lexical order, recording them in
// schema_migrations. Migrations only move forward; fixes arrive as new files.
func Migrate(ctx context.Context, pool *pgxpool.Pool, log *slog.Logger) error {
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("migrate: read dir: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	if len(names) == 0 {
		return fmt.Errorf("migrate: no migration files found")
	}

	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("migrate: create schema_migrations: %w", err)
	}

	for _, name := range names {
		var exists bool
		if err := pool.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, name).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		body, err := fs.ReadFile(migrationsFS, "migrations/"+name)
		if err != nil {
			return err
		}
		for _, stmt := range splitStatements(string(body)) {
			if strings.TrimSpace(stmt) == "" {
				continue
			}
			if _, err := pool.Exec(ctx, stmt); err != nil {
				return fmt.Errorf("migrate: %s: %w\nstatement:\n%s", name, err, stmt)
			}
		}
		if _, err := pool.Exec(ctx,
			`INSERT INTO schema_migrations(version) VALUES ($1)`, name); err != nil {
			return err
		}
		if log != nil {
			log.Info("migration applied", "version", name)
		}
	}
	return nil
}

// splitStatements naively splits a DDL file on ';' while ignoring line
// comments and string literals. The initial schema contains no functions or
// dollar-quoted bodies, which keeps this safe.
func splitStatements(src string) []string {
	var out []string
	var cur strings.Builder
	inQuote := false
	for _, line := range strings.Split(src, "\n") {
		t := line
		if i := strings.Index(t, "--"); i >= 0 {
			t = t[:i]
		}
		for _, r := range t {
			if r == '\'' {
				inQuote = !inQuote
			}
			cur.WriteRune(r)
			if r == ';' && !inQuote {
				out = append(out, cur.String())
				cur.Reset()
			}
		}
		cur.WriteByte('\n')
	}
	if strings.TrimSpace(cur.String()) != "" {
		out = append(out, cur.String())
	}
	return out
}
