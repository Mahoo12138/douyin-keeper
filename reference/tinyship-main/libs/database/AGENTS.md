# AGENTS.md

## Overview

Database layer using Drizzle ORM with **multi-dialect support**: PostgreSQL (default), local SQLite, and Cloudflare D1. Deploy-time dialect selection via the `DB_DIALECT` environment variable.

## Architecture

```
libs/database/
├── shared/
│   └── dialect.ts           # Dialect detection (DB_DIALECT env var)
├── schema/
│   ├── pg/                  # PostgreSQL schemas (pgTable)
│   ├── sqlite/              # SQLite schemas (sqliteTable) — shared by local SQLite and D1
│   ├── *.ts                 # Proxy files (auto-select dialect at runtime)
│   └── index.ts             # Barrel re-export
├── drivers/
│   ├── pg.ts                # PG Pool + drizzle instance + ALS helpers
│   ├── sqlite.ts            # Local SQLite via better-sqlite3
│   └── d1.ts                # Cloudflare D1 binding via ALS + Proxy
├── constants.ts             # Dialect-independent enums and constants
├── index.ts                 # Main entry (dialect router)
├── client.ts                # Thin re-export (backward compat)
├── utils/
│   ├── subscription.ts      # Subscription check logic
│   └── utc.ts               # UTC helpers
├── check-connection.ts      # Connection check (supports all dialects)
├── seed.ts                  # Seed script (supports all dialects)
├── scripts.js               # CLI runner for db:* commands
├── drizzle/                 # PG migration output
└── drizzle-sqlite/          # SQLite migration output
```

### Dialect Selection

| `DB_DIALECT` | Backend | Driver | Use Case |
|-------------|---------|--------|----------|
| `pg` (default) | PostgreSQL | `drizzle-orm/node-postgres` + `pg` Pool | Production, traditional hosting |
| `sqlite` | Local SQLite file | `drizzle-orm/better-sqlite3` | Local development, edge functions |
| `d1` | Cloudflare D1 | `drizzle-orm/d1` via Workers binding | Cloudflare Workers production |

`sqlite` and `d1` share the same schema definitions (`schema/sqlite/`). The only difference is the driver: `better-sqlite3` for local use vs Cloudflare D1 binding for Workers.

### Schema Type Mapping

| PostgreSQL | SQLite / D1 |
|-----------|-------------|
| `pgTable(...)` | `sqliteTable(...)` |
| `timestamp('col')` | `integer('col', { mode: 'timestamp' })` |
| `boolean('col')` | `integer('col', { mode: 'boolean' })` |
| `jsonb('col')` | `text('col', { mode: 'json' })` |
| `numeric('col')` | `text('col')` |
| `text('col')` | `text('col')` |

## Setup Commands

```bash
# --- PostgreSQL ---
pnpm db:check              # Check PG connection
pnpm db:generate           # Generate PG migration files
pnpm db:push               # Push schema to PG (development)
pnpm db:migrate            # Apply PG migrations (production)
pnpm db:seed               # Seed test data into PG
pnpm db:studio             # Launch Drizzle Studio for PG

# --- SQLite (local development + D1 compatible) ---
pnpm db:check:sqlite       # Check SQLite connection
pnpm db:generate:sqlite    # Generate SQLite migration files
pnpm db:push:sqlite        # Push schema to local SQLite file
pnpm db:migrate:sqlite     # Apply SQLite migrations
pnpm db:seed:sqlite        # Seed test data into local SQLite
pnpm db:studio:sqlite      # Launch Drizzle Studio for SQLite
```

### Quick Start: Local SQLite Development

```bash
# 1. Push schema to create local SQLite database
pnpm db:push:sqlite

# 2. Seed with test data
pnpm db:seed:sqlite

# 3. Browse the data
pnpm db:studio:sqlite

# 4. Run any app with SQLite
DB_DIALECT=sqlite pnpm dev:next
```

## Code Style

- Drizzle ORM with multi-dialect schemas (PG + SQLite)
- Text-based primary keys (UUID format recommended)
- Numeric fields as strings for precision (e.g., `amount: "100"`)
- Automatic timestamps (`createdAt`, `updatedAt`)
- Foreign key relationships with proper constraints
- JSON metadata fields for extensibility
- Constants and enums in `constants.ts` (dialect-independent)
- Parallel schema definitions in `schema/pg/` and `schema/sqlite/` must stay in sync

## Usage Examples

### Basic Queries

```typescript
import { db, user, subscription } from "@libs/database";
import { eq, and } from "drizzle-orm";

// Works identically for PG, SQLite, and D1
const userResult = await db.select()
  .from(user)
  .where(eq(user.email, "user@example.com"));
```

## Environment Configuration

```env
# Database dialect: "pg" (default), "sqlite", or "d1"
DB_DIALECT="pg"

# PostgreSQL connection (required when DB_DIALECT=pg)
DATABASE_URL="postgresql://username:password@localhost:5432/tinyship"

# SQLite file path (optional, defaults to ./data/local.sqlite)
# SQLITE_DB_PATH="./data/local.sqlite"
```

## Drizzle Kit Configuration

- **PostgreSQL**: `drizzle.config.ts` — dialect `postgresql`, schema from `schema/pg/*`
- **SQLite**: `drizzle.config.sqlite.ts` — dialect `sqlite`, schema from `schema/sqlite/*`

## Troubleshooting

### Connection Issues
- Check `DB_DIALECT` is set correctly
- PG: verify `DATABASE_URL` format and that PostgreSQL is running
- SQLite: the file is auto-created at `SQLITE_DB_PATH` (default: `./data/local.sqlite`)
- D1: ensure `d1_databases` binding is configured in `wrangler.jsonc`

### Schema Sync Issues
- PG and SQLite schemas must define the same tables/columns
- Run `pnpm db:generate` (PG) and `pnpm db:generate:sqlite` (SQLite) after schema changes
- Constants in `constants.ts` are shared — add new enums there, not in schema files

### SQLite / D1 Limitations
- No JSONB operators — avoid PG-specific `->`, `->>`, `@>` in shared code
- D1 single-writer constraint: high-write workloads may need review
- `defaultNow()` not available in SQLite — use `$defaultFn(() => new Date())` instead

## Architecture Notes

- **ORM**: Drizzle for type-safe queries and schema management
- **Three Dialects**: PostgreSQL + local SQLite + Cloudflare D1
- **Shared Schemas**: `schema/sqlite/` is used by both local SQLite and D1
- **Runtime Selection**: `DB_DIALECT` env var drives dialect at module initialization
- **Type Safety**: Compile-time types from PG (primary dialect); SQLite/D1 runtime is API-compatible
- **Better Auth**: Adapter provider switches between `pg` and `sqlite` automatically
