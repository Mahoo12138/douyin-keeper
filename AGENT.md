# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state: design-complete, pre-implementation

Douyin Keeper Next (抖音火花助手) is a multi-account Douyin "spark" (火花 / streak) maintenance tool: users bind Douyin accounts, sync real friends, configure daily-interaction tasks per friend, and observe/manage everything from a PC web app and a WeChat mini program. Operators manage users, accounts, workers, risk, and entitlement via a PC admin console.

The repository is in **Milestone M0**: the full architecture, domain model, contracts, and state machines are frozen in `docs/` (authoritative, Chinese-language) and the monorepo is now scaffolded per docs/08 — Go backend (`backend/`), frontend apps (`apps/web`, `apps/admin`, `apps/mini`), contracts + SDK (`packages/`), Playwright sidecar skeleton (`sidecars/playwright`), CI, and deploy files. M0 delivers a working `register → login → me → redeem` round-trip against real PostgreSQL; Douyin automation (QR binding, friend sync, browser send) arrives in M1–M3. Do not invent designs not in `docs/`.

## Authoritative starting points

- `docs/00-index.md` — index, overall architecture diagram, and core principles. Read this first.
- `docs/08-roadmap-repo.md` — tech stack, planned monorepo layout, milestones (M0–M7), and the 16 contracts that must be frozen before implementation.
- `docs/14-go-backend-package-design.md`, `docs/15-scheduler-worker-state-machine.md`, `docs/13-auth-entitlement-engineering.md` — the three engineering constraint docs that govern all backend code.
- Contract sources (moved into the monorepo during M0):
  - PostgreSQL DDL: `backend/internal/infra/postgres/migrations/000001_init.sql` (embedded into the `migrate` binary via `go:embed`; see the README note on why it does not live at a root `db/` dir)
  - `packages/contracts/openapi.yaml`
  - `packages/contracts/sidecar/v1.schema.json`

The projects under `reference/` are committed for study, not reuse:

- `TikTokcn-AutoSpark` and `douyin-sparkflow-main` — **vendored upstream implementations** of similar spark-maintenance tools, for studying Douyin page selectors, feature behavior, and prior mistakes. Do not copy their code into the new architecture or treat their design decisions as current.
- `tinyship-main` (TinyShip SaaS monorepo starter) — **the reference for this project's frontend technology and design** (from `apps/tanstack-app`). See the section below; it refines the frontend stack in docs/08.

## Commands (M0 verified working)

- Backend: single Go module in `backend/`, Go 1.24+, chi, pgx, Asynq. Build/test:
  - `cd backend && go build ./... && go vet ./...`
  - `go test ./...` — integration tests **skip without `TEST_DATABASE_URL`**; with it (e.g. `postgres://keeper:change-me@localhost:5432/douyin_keeper_test?sslmode=disable`) they run against real PostgreSQL (docs/14 §16). The harness creates the test database if missing.
- Dev infra: `docker compose -f deploy/compose/docker-compose.dev.yml up -d` (postgres + redis only).
- Migrate + seed: `go run ./cmd/migrate` then `go run ./cmd/migrate seed` (prints the admin user + one demo DK1 card; requires `CARD_CODE_PEPPER_DK1`).
- Run: `go run ./cmd/api` (needs `AUTH_SIGNING_KEY`, `AUTH_REFRESH_PEPPER`, `SESSION_MASTER_KEY`, `CARD_CODE_PEPPER_DK1` set). Other binaries: `./cmd/scheduler`, `./cmd/worker-{interactive,browser,light}`.
- Frontend: `pnpm install` at repo root; `pnpm --filter @douyin-keeper/sdk-ts generate` regenerates the typed SDK from the OpenAPI contract; `pnpm --filter @douyin-keeper/web dev` (port 5173, proxies `/api` → `localhost:8080`), `apps/admin` on 5174; builds via `pnpm build:web` / `pnpm build:admin` → `dist/` consumed by `go:embed`.
- Contracts check: `pnpm --filter @douyin-keeper/contracts validate`.
- Deploy (docs/16): copy `.env.example` to root `.env`, then `docker compose --env-file .env -f deploy/compose/docker-compose.yml up -d` (build `keeper-backend`/`keeper-worker` images first via the Dockerfiles in `deploy/docker/`).
- Only `.env.example` is committed; never commit `.env`. Secrets (`AUTH_SIGNING_KEY`, `AUTH_REFRESH_PEPPER`, `SESSION_MASTER_KEY`, `CARD_CODE_PEPPER_DK1`, `WECHAT_APP_ID/SECRET`) come from environment/secret manager.

## Frontend technology & design reference

User directive: model this project's frontend on **`reference/tinyship-main/apps/tanstack-app`** (the React/TypeScript app inside TinyShip, a multi-framework SaaS monorepo starter). This refines docs/08's earlier frontend suggestion (React 19 + Vite + React Router + Ant Design/shadcn + TanStack Query): the reference uses **TanStack Start instead of React Router** and a **shadcn/ui + Tailwind CSS v4 design system**.

Adopt from the reference (verified against its code, not invention):

- **Framework**: TanStack Start — full-stack React on TanStack Router (file-system routing, auto-generated `routeTree.gen.ts`) + Vite. React 19, strict TypeScript. Data via route `loader`; mutations via `createServerFn` (type-safe RPC); raw HTTP endpoints via `createAPIFileRoute` — keep these thin, domain logic stays in the Go backend through the OpenAPI SDK.
- **Routing layout**: `src/routes/__root.tsx` = root document + global providers (theme, sonner toaster) + `head()`; path segments/route groups `(auth)` and `(root)` separate page-classes; a dedicated `admin` group for the console; protected pages use `beforeLoad` auth guards. The reference app's `$lang` route-param i18n can be simplified away since this project is single-locale (zh-CN).
- **Design system**: shadcn/ui "new-york" style (`components.json`), Tailwind CSS v4 CSS-first theme (`src/styles.css`, no config file), Radix primitives, CVA + `clsx`/`tailwind-merge` (`cn`), `tw-animate-css`, lucide-react icons, sonner toasts, framer-motion. Shared UI primitives live in one shared package pointed at by the shadcn `ui` alias (`@libs/react-shared/ui/*`) — mirror this with the planned `packages/ui-web` so web and admin share components.
- **Forms**: react-hook-form + `@hookform/resolvers` + Zod schemas.
- **Admin data tables**: per-entity folder of `-columns.tsx` + `-data-table.tsx` (TanStack Table) + `components/-search.tsx` / `-column-toggle.tsx` beside the page's `index.tsx`. Reuse this pattern for the admin console's users/accounts/tasks/risk/audit pages.
- **Directly relevant built-ins**: `qrcode` (Douyin QR binding display), `input-otp` (future SMS binding), switch/progress/slider Radix primitives (spark on/off, risk/capability status), recharts (admin operational overview).
- **i18n discipline**: no hardcoded user-facing strings — all UI text via translation keys (project is zh-CN-first).

Do **not** carry over from TinyShip: Cloudflare/Wrangler deployment (this project ships via go:embed + docker-compose per docs/16), Better Auth (docs/13 defines its own auth contract), payments/credits/AI/affiliate, or three-framework parity.

## Architecture at a glance

```text
PC web  +  Admin (go:embed into backend)  +  WeChat mini (independent)
                    │
                    ▼
              Go Backend (API + SSE) ──► PostgreSQL (source of truth) ──► queue_outbox
                    │                          │                              │
                 Redis (transport) ◄── Outbox Publisher ──► Asynq ─► Scheduler ─────────┐
                    │                                                        │            │
                    └──────► worker-interactive / worker-browser / worker-light ──────┘
                                          │
                             Playwright Sidecar (Python) / Protocol Sidecar (Node, optional)
                                          │
                                        Douyin
```

Key structural decisions (all detailed in docs/04):

- **One Go module, many binaries.** `backend/` is a single `go.mod` with `cmd/{api,migrate,scheduler,worker-interactive,worker-browser,worker-light}` sharing `internal/` domain packages. Deployment maintains only two business images: `keeper-backend` (API + embedded web/admin SPA) and `keeper-worker` (scheduler + all three worker pools + sidecar runtime); the four worker entrypoints differ only by compose `command`. Production is one `docker-compose.yml` project; only backend:8080 is exposed.
- **DB is truth, queue is transport.** All cross-DB/queue task creation happens via a transactional outbox (`queue_outbox`) written in the same DB transaction; Redis/Asynq never store business state. Asynq payloads carry only stable IDs (outbox_id / job_id / intent_id) — no secrets in task bodies.
- **Intent/Job double idempotency.** A scheduled daily send goes `SparkTask → SendIntent (one per task per local_date) → SendJob attempts (one per retry)`. Scheduling and dispatch both dedupe; Redis duplicate delivery is absorbed by `CAS queued → running`.
- **Workers are split by workload.** `worker-interactive` (QR/SMS login, heavyweight, low concurrency), `worker-browser` (friends sync / browser send / session check; global browser semaphore), `worker-light` (send dispatch, protocol send, capability probe, high concurrency). Scheduler is a separate lean process (leader lock `lock:scheduler:leader`) doing tick/retry-scan/lease-reaper/outbox-recovery.
- **Douyin access is adapter/capability-based.** Business code calls logical capabilities (`Login / ValidateSession / ListFriends / SendText`) through a resolver; implementations live in a Playwright sidecar speaking NDJSON over stdin/stdout (contract: docs/10 + the JSON schema). Secret session material passes only via 0600 temp files referenced by path. Protocol adapter is optional (V1.2) and its failure must never flip `session_status`.
- **Auth ≠ Entitlement.** Auth is username+password (`local`) and WeChat mini (`wechat_mini`) identities with short-lived JWTs + revocable refresh sessions (HttpOnly cookie on web). Entitlement is a separate context: `EntitlementPlan + CardBatch/CardCode + EntitlementGrant`, redeemable via card codes, **no payment/order system**. Quotas (account slots, task count, daily sends) are derived from the effective grant and reserved atomically.
- **Account is the isolation boundary.** Encrypted per-account sessions (`account_sessions`, AES-256-GCM), per-account friends/conversations/tasks/risk, and a Redis account lock (`lock:account:{account_id}`, owner-token compare-and-delete) around every platform-mutating operation.

## Domain model essentials (docs/03, docs/09)

- `users` → `douyin_accounts` → `friends` (stable `platform_user_id` string is the send-routing key; nickname is display-only) → `spark_tasks` (daily window `window_start`–`window_end`, timezone, optional sticker)
- `send_intents` (status incl. `retry_wait`; unique `(task_id, local_date)` for scheduled, `request_id` for manual) → `send_jobs` (unique `(intent_id, attempt)`, worker lease/heartbeat fields)
- `jobs` + `job_events` for interactive long-runs (QR binding, session check, friend sync) with SSE status progression `queued → running → waiting_user → …`
- `capability_snapshots`, `adapter_health` (circuit breaker), `risk_events` (categories AUTH/PLATFORM/PROTOCOL/BROWSER/NETWORK/DATA), `entitlement_daily_usage`, `queue_outbox`
- IDs: `int64` internal DB IDs, `UUID public_id` at API boundaries, platform IDs as strings; handlers resolve public UUID → owned internal ID (`GetOwned`-style repo methods enforce ownership; admin uses separate queries, never a bypass flag).

## Invariants that must hold (docs/15 §22) and status-machine facts

1. One scheduled Intent per task per day; one manual Intent per Idempotency-Key.
2. At most one running SendJob per Intent.
3. At most one platform write per account at a time (account lock).
4. Redis duplicate delivery never re-executes a terminal Job.
5. Outbox publish failure never loses a business Job.
6. A worker crash never blindly resends an outcome-unknown message — reconcile or fail closed.
7. Entitlement expiry/revoke stops all further platform actions (double-checked: at intent creation and at worker preflight; final failure → Intent `skipped`).
8. Protocol failure never marks session expired; only `session.validate` may.
9. Never send when friend stable identity is unresolved/ambiguous (`identity_status`).
10. Success is only recorded on verifiable evidence (`platform_message_id` or adapter-confirmed receipt) — never "no error" or "button clicked".

Retry only covers errors provably without platform side effects (`NETWORK_CONNECT_FAILED`, `SIDECAR_*`, no-confirmation 5xx); `NETWORK_TIMEOUT` is conditional (reconcile first); `SESSION_EXPIRED`, `CHALLENGE_REQUIRED`, `PLATFORM_RATE_LIMITED`, `TARGET_IDENTITY_MISMATCH`, `ADAPTER_INCOMPATIBLE` etc. are not auto-retried.

## Coding conventions (hard rules from docs/14)

- **Dependency direction** must be `cmd → transport → domain ⇠⇡ infra-implements-interfaces`. Forbidden: `auth→httpapi`, `send→asynq`, `account→postgres`, `platform/douyin→handler`. Domain packages define interfaces; `internal/infra/{postgres,redislock,asynqqueue,cryptox,clock,telemetry}` implements them.
- Bounded-context packages (e.g. `internal/entitlement/{model,service,repository,policy,errors}.go`), not global `models//repositories//services//handlers/` layers.
- Transactions via `TxManager.WithinTx` (no `*sql.Tx` smuggling); inside a tx: no sidecar calls, no HTTP, no direct Redis enqueue — side effects go through the outbox.
- Errors: packages return typed domain errors, mapped to a stable ErrorCode + `AppError{Code, Kind, Retryable, SafeMsg, Cause}` with `Cause` never returned to the API. HTTP mapping: 400/401/403/404/409/429/503/500 per Kind.
- Structured logging with `request_id / trace_id / job_public_id / account_public_id / intent_public_id`. Never log: Authorization, cookies, refresh tokens, card codes, storage_state, SMS codes, session plaintext/ciphertext.

## Repository layout note

There is no root `README.md` yet and no `.gitignore` beyond the vendored projects' own. The planned monorepo tree (docs/08 §2) is: `apps/{web,admin,mini}`, `backend/`, `sidecars/{playwright,protocol}`, `packages/{contracts,sdk-ts,ui-web}`, `db/{migrations,seeds}`, `deploy/`, `docs/`. `apps/web` and `apps/admin` should be scaffolded from the frontend reference above. Scaffolding this in the M0 milestone is the correct first implementation step.
