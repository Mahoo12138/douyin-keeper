# Douyin Keeper Next (抖音火花助手)

Multi-account Douyin "spark" (火花 / streak) maintenance tool. Users bind Douyin accounts, sync real friends,
configure daily interaction tasks per friend, and observe everything from a PC web app and a WeChat mini program.
Operators manage users, accounts, workers, risk, and entitlement via a PC admin console.

The architecture, domain model, contracts, and state machines are **frozen in `docs/`** (authoritative, Chinese-language).
The repository now includes the M0 foundation, the core M1–M3 account/friend/send backend flows, and functional PC account, friends, and task surfaces with QR binding progress, capability snapshots, friend synchronization, filters, spark-maintenance toggles, task editing, and run-now actions. History, Mini Program, and Admin surfaces continue to land incrementally. See `docs/08-roadmap-repo.md` for the roadmap (M0–M7).

## Layout

```text
backend/              # single Go module, multi-cmd (api, migrate, scheduler, worker-*)
apps/web, apps/admin  # TanStack Router + Vite SPA, shadcn/ui + Tailwind v4 (reference: reference/tinyship-main)
apps/mini             # WeChat mini program (Taro + React) skeleton
packages/contracts    # OpenAPI 3.1 + sidecar JSON Schema (single source of truth)
packages/sdk-ts       # generated TypeScript API client
packages/ui-web       # shared shadcn/ui primitives for web + admin
sidecars/playwright   # Python NDJSON sidecar (Douyin automation runtime, skeleton at M0)
db/migrations         # see note below
deploy/               # compose + Dockerfiles (production + dev)
docs/                 # authoritative design documents
reference/            # vendored upstream projects, for study only
```

> **Note on migrations**: the canonical PostgreSQL DDL lives at
> `backend/internal/infra/postgres/migrations/000001_init.sql` (embedded into the `migrate` binary via
> `go:embed`, matching the contract draft `schema-v1.sql`). `docs/08` initially proposed a root `db/migrations/`
> directory; `docs/14` explicitly allows the migrations to live inside the Go module so the containerized
> migrate binary is self-contained.

## Quick start (backend)

Prereqs: Go 1.24+, Docker, Node 20+ / pnpm.

```bash
# 1. env (never commit .env)
Copy-Item .env.example .env   # msys/bash: cp .env.example .env
# fill in AUTH_SIGNING_KEY, SESSION_MASTER_KEY, CARD_CODE_PEPPER_DK1 (high-entropy values)

# 2. local infra (postgres + redis) + schema + seed
docker compose -f deploy/compose/docker-compose.dev.yml up -d
cd backend
$env:DATABASE_URL='postgres://keeper:change-me@localhost:5432/douyin_keeper?sslmode=disable'
go run ./cmd/migrate          # apply migrations
go run ./cmd/migrate seed     # admin user + demo plan + one demo DK1 card (printed)

# 3. run API
go run ./cmd/api
# http://localhost:8080/health/ready
```

Smoke test the seeded demo card:

```bash
curl -s localhost:8080/api/v1/auth/register -H 'content-type: application/json' -d '{"username":"demo","password":"password123"}'
TOKEN=$(curl -s localhost:8080/api/v1/auth/login -H 'content-type: application/json' -d '{"username":"demo","password":"password123"}' | python -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s localhost:8080/api/v1/me -H "authorization: Bearer $TOKEN"
curl -s localhost:8080/api/v1/entitlements/redeem -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"code":"<SEEDED DK1 CODE>"}'
curl -s localhost:8080/api/v1/me/entitlement -H "authorization: Bearer $TOKEN"
```

Tests (integration tests require `TEST_DATABASE_URL`, and skip cleanly without it):

```bash
docker compose -f deploy/compose/docker-compose.dev.yml up -d
cd backend
$env:TEST_DATABASE_URL='postgres://keeper:change-me@localhost:5432/douyin_keeper_test?sslmode=disable'
go test ./...
```

## Frontend

```bash
pnpm install
pnpm --filter ./apps/web dev    # http://localhost:5173 (proxies /api -> localhost:8080)
pnpm --filter ./apps/admin dev  # http://localhost:5174
pnpm build:spa                  # dists consumed by go:embed (docs/16)
```

## Deploy

See `docs/16-deployment-packaging.md` and `deploy/compose/docker-compose.yml`. Two business images
(`keeper-backend`, `keeper-worker`) + postgres + redis are the only production units.

## More

- Design docs: `docs/00-index.md` (start here)
- Engineering constraints: `docs/13`, `docs/14`, `docs/15`, `docs/16`
- Frontend reference: `reference/tinyship-main/apps/tanstack-app` (see CLAUDE.md)
