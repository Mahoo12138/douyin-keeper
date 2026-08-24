# 技术栈、仓库结构与开发路线

## 1. 推荐技术栈

### Web C 端 / Admin

推荐统一 React + TypeScript：

- React 19+
- Vite
- React Router
- TanStack Query
- Zustand 或轻量 Context
- Ant Design / shadcn + Radix 二选一

Admin 与 C 端可以共享：

- API Client
- TypeScript DTO
- 表格/表单基础组件
- Auth 逻辑

当前实现统一为一个 `apps/web` 应用：普通用户使用顶层路由，Admin 使用 `/admin/*` 嵌套路由，共享登录态、组件库、主题和构建产物。

### 微信小程序

推荐 Taro + React + TypeScript。

优势：

- 与 PC 统一 React/TS 心智；
- 可以共享 API Client、DTO、校验 schema；
- UI 层不强行共享，避免 Web 与小程序组件差异拖累开发。

### Backend

- Go
- PostgreSQL
- Redis
- Asynq

### Automation

- Python + Playwright
- Node.js Protocol Sidecar（V1.2 可选）

## 2. Monorepo

```text
douyin-keeper/
├─ apps/
│  ├─ web/                  # PC C 端 + /admin/* 管理后台
│  └─ mini/                 # 微信小程序
│
├─ backend/                  # 单 Go Module
│  ├─ go.mod
│  ├─ cmd/
│  │  ├─ api/
│  │  ├─ migrate/
│  │  ├─ scheduler/
│  │  ├─ worker-interactive/
│  │  ├─ worker-browser/
│  │  └─ worker-light/
│  └─ internal/             # auth/entitlement/account/send/... + infra/transport
│     └─ transport/webassets/ # Release 时嵌入统一 SPA dist
│
├─ sidecars/
│  ├─ playwright/           # Python
│  └─ protocol/             # Node，可选
│
├─ packages/
│  ├─ contracts/            # OpenAPI/schema/generated types
│  ├─ sdk-ts/               # Web/Mini API Client
│  ├─ ui-web/               # 统一 PC App 共享组件
│  └─ eslint-config/
│
├─ db/
│  ├─ migrations/
│  └─ seeds/
│
├─ deploy/
│  ├─ docker/
│  │  ├─ backend.Dockerfile
│  │  └─ worker.Dockerfile
│  └─ compose/
│     └─ docker-compose.yml
│
├─ docs/
└─ README.md
```

## 3. API Contract

推荐 OpenAPI 作为跨语言契约源：

Go API → OpenAPI → 自动生成 TypeScript SDK。

Sidecar 不走 HTTP 公网服务，使用：

- stdin/stdout NDJSON，或
- 本机 Unix Socket。

Sidecar Contract 另外维护 JSON Schema，版本化：

`sidecar_protocol_version = 1`

## 4. 开发阶段

### M0 — 基础骨架

- Monorepo；
- CI；
- Go 单 Module + 多 cmd；
- API；
- DB migration；
- Redis/Asynq；
- Transactional Outbox；
- Web C 端登录；
- Admin 登录；
- 小程序登录骨架；
- Entitlement/Card Code 基础模型与兑换接口。

### M1 — 抖音账号

- Account；
- QR Binding；
- Session Encryption；
- Session Check；
- Account Lock；
- PC 账号管理页面。

### M2 — 好友

- Friends Sync；
- platform_user_id；
- conversation_id；
- 好友列表；
- 火花开关。

### M3 — 任务

- SparkTask；
- SendIntent；
- SendJob；
- Browser Text Sender；
- History；
- Risk Event。

### M4 — 小程序

- 首页；
- 账号状态；
- 火花列表；
- 任务开关；
- 发送记录；
- 微信身份与 PC User 绑定。

当前已完成 M4 的首页、身份入口、火花列表、任务启停与发送记录切片：首页可读取用户、账号、任务和当日发送记录，登录页支持微信登录、PC 绑定码和退出登录，火花页支持账号切换、好友维护开关和每日任务开关，记录页支持最近 7 天查询与移动端状态分组；真实微信身份兑换依赖后端微信 AppID/Secret 配置。

### M5 — Admin / Ops

- 用户；
- 账号；
- Worker；
- 队列；
- Adapter；
- 风险；
- Audit。

当前已完成 M5 的用户、账号、Worker/队列与 Adapter 切片：统一 Web Admin 页面通过管理员角色保护的 `/admin/users`、`/admin/accounts`、`/admin/workers`、`/admin/adapters` API 展示用户资源、账号状态、Capability、发送/风险、运行时队列和 Adapter 健康摘要；Adapter 启停已写入审计日志，账号暂停/恢复、风险和审计页面继续按本路线实现。

### M6 — V1.1

- SMS Binding；
- Sticker；
- 通知；
- Capability UI。

### M7 — V1.2

- Protocol Adapter；
- Circuit Breaker；
- Creator First；
- 多 Worker 扩展；
- 多档权益方案与授权迁移策略。

## 5. 编码前必须先冻结的契约

开始正式实现前，先确定并尽量不频繁改动：

1. `User / DouyinAccount / Friend / SparkTask / SendIntent / SendJob` 数据模型；
2. Friend 稳定身份来源；
3. Sidecar Input/Output Contract；
4. Error Code；
5. Job Event；
6. Account Lock；
7. Capability 命名；
8. Session Envelope；
9. MVP 页面范围；
10. `schema-v1.sql` 数据库初始契约；
11. `sidecar-protocol-v1.schema.json`；
12. `openapi-v1.yaml`；
13. `EntitlementPlan / CardBatch / CardCode / EntitlementGrant` 授权契约；
14. AuthSession / LinkCode / Refresh rotation；
15. Transactional Outbox；
16. SendIntent / SendJob / Job Lease 状态机。

这些契约确定后，再并行开发前端、Go 与 Playwright，返工会明显减少。


## 6. 开仓时建议直接落位

```text
db/migrations/000001_init.sql        <- schema-v1.sql 拆分后
packages/contracts/openapi.yaml       <- openapi-v1.yaml
packages/contracts/sidecar/v1.schema.json
docs/architecture/                    <- 本设计文档集
```

第一阶段不要一边写 Handler 一边临时发明 DTO。优先让 OpenAPI、数据库 migration、Sidecar schema 成为三个独立的契约源，再并行生成 Go/TypeScript 类型与实现。


## 7. 后端工程设计文档

正式编码以以下三份工程文档为实现约束：

- `13-auth-entitlement-engineering.md`
- `14-go-backend-package-design.md`
- `15-scheduler-worker-state-machine.md`

## 8. Release 与部署约束

PC C 端和 Admin 在开发时统一使用 `apps/web` 的 Vite Dev Server/HMR；生产 Release 时必须先构建统一 SPA，再复制到 `backend/internal/transport/webassets/dist/web`，由 `go:embed` 编进 Backend。部署时不再额外启动 Web/Admin 容器。

生产 Compose 统一包含 PostgreSQL、Redis、一次性 `migrate`、Backend、Scheduler 和各 Worker Pool。Scheduler/Worker 复用一个 Worker 镜像，通过不同入口命令启动。

微信小程序独立构建、上传微信平台，不进入 Docker Compose。详见 `16-deployment-packaging.md`。
