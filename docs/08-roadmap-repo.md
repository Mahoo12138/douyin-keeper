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

当前实现统一为一个 `apps/web` 应用：普通用户使用顶层路由，Admin 使用 `/admin/*` 嵌套路由，共享登录态、组件库、主题和构建产物；统一用户壳提供用户菜单、管理员入口和响应式移动导航，退出会同时撤销后端会话并清理内存 Token。

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
- PC 账号管理页面（`/accounts`）与独立绑定页（`/accounts/new`），复用 QR/SMS 绑定流程组件。

当前账号管理页面已补齐 QR/SMS 重新登录、暂停/恢复任务和解除绑定闭环：重新登录复用原账号并只在
验证成功后替换 Session；解除绑定在同一事务中软删除账号、停用任务、
取消后续未执行 Intent、请求取消关联 Job，并撤销账号 Session。
账号列表也已补齐好友数、启用任务数和产品自然日发送成功/失败摘要，避免页面为每个账号额外
请求好友、任务和发送记录。账号列表已接入统一 cursor pagination，默认 50 条，Web 账号页支持
继续加载；其他账号选择入口会自动读取后续页面。

### M2 — 好友

- Friends Sync；
- platform_user_id；
- conversation_id；
- 好友列表；
- 火花开关。

M2 当前实现还提供独立的会话列表 API 和 `/conversations` 页面：会话通过账号归属
隔离查询，前端展示对端身份状态、通道、最近消息和最近同步时间，并复用统一 SPA
组件库与主题；会话索引列表已接入统一 cursor pagination，默认 50 条并由 Web “加载更多”读取后续页面。
独立 `conversations.list` Sidecar 的分页输入校验与未配置时的 fail-closed 响应已接入，真实
分页抓取仍待平台 selector 联调，不在本切片中猜测内部 DOM。好友页已支持已解析好友的批量火花开关和已有任务时间窗口
批量编辑，时间窗口沿用任务 PATCH 契约，不隐式创建任务；好友列表已接入统一 cursor pagination，
Web 端通过“加载更多”读取后续页面。

### M3 — 任务

- SparkTask；
- SendIntent；
- SendJob；
- Browser Text Sender；
- History；
- Risk Event。

任务列表已接入统一 cursor pagination，默认 50 条、最多 100 条，Web 端通过“加载更多”读取后续页面。
发送记录列表已接入统一 cursor pagination，默认 50 条、最多 100 条，Web `/history` 按筛选条件通过“加载更多记录”读取后续页面；任务页按账号并行完整读取好友 cursor 分页，避免大账号的任务行或编辑器只看到前 100 个好友，并使用独立查询缓存键避免与好友页的无限查询形态冲突。

### M4 — 小程序

- 首页；
- 账号状态；
- 火花列表；
- 任务开关；
- 发送记录；
- 微信身份与 PC User 绑定。

当前已完成 M4 的首页、身份入口、火花列表、任务启停与发送记录切片：首页并行展示用户、权益、账号健康、当日发送状态、下一次计划、最新风险提醒和未读数，并支持单条/全部标记已读；多账号首页使用共享账号标签切换状态、登录态检查和当前账号下一次任务，今日统计保持用户维度汇总；账号状态卡支持提交登录态检查 Job；启用中的下一次任务支持带 UUID 幂等键的“立即执行”，仅在队列接受后提示成功，统计按 `Asia/Shanghai` 自然日边界；登录页支持微信登录、PC 绑定码、退出登录、权益状态/到期时间、最近兑换记录、帮助与协议说明和 DK1 卡密兑换，兑换后立即刷新权益与记录，火花页支持账号切换、好友维护开关、每日任务启停以及已有任务的时间窗口和文字/贴纸内容编辑，记录页支持开始/结束日期筛选、统一 cursor 分页与移动端状态分组；PC Web 账号详情 `/accounts/:id` 已提供概览、好友、任务、记录、登录与能力五个 Tab，并支持账号级会话检查与好友同步；真实微信身份交换已接入，启用它仍需要配置微信 AppID/Secret。
账号详情的任务与发送记录分区也复用统一无限分页查询，支持继续加载，不与列表页使用不同的缓存数据形态。

### M5 — Admin / Ops

- 用户；
- 账号；
- Worker；
- 队列；
- Adapter；
- 风险；
- Audit。

当前已完成 M5 的运营概览、用户、账号、Worker/队列、Adapter、风险、审计、站点设置以及权益与卡密管理：统一 Web Admin 页面通过管理员角色保护，页面路由为 `/admin`、`/admin/users`、`/admin/accounts`、`/admin/workers`、`/admin/jobs`、`/admin/adapters`、`/admin/risks`、`/admin/settings`、`/admin/audit`、`/admin/entitlement` 及其明细路由；页面分别消费 `/api/v1/admin/overview`、`/api/v1/admin/users`、`/api/v1/admin/users/{id}`、`PATCH /api/v1/admin/users/{id}`、`/api/v1/admin/accounts`、`/api/v1/admin/workers`、`/api/v1/admin/jobs`、`/api/v1/admin/adapters`、`/api/v1/admin/risks`、`/api/v1/admin/settings`、`/api/v1/admin/audit-logs`、`/api/v1/admin/entitlement-plans`、`/api/v1/admin/card-batches`、`/api/v1/admin/redemptions` 和 `/api/v1/admin/users/{id}/entitlements` 展示 DAU、发送成功率、失败码 Top、风险账号、队列/Worker 运行态、Generic Job 生命周期、用户资源、账号状态、Capability、Adapter 健康、受约束站点配置、审计、卡密摘要和用户授权时间线；用户详情支持禁用/恢复和按资源 ID 查看脱敏审计时间线，禁用事务性撤销全部 AuthSession/Refresh Token，恢复要求重新登录；Adapter 启停、账号暂停/恢复、用户禁用/恢复、站点配置更新、方案/批次创建与停用、人工 Grant/Revoke、未使用卡密撤销等动作写入审计日志，配置值本身不写入审计详情。Admin 用户、账号、风险、审计、权益方案/批次/兑换主列表以及卡密明细/用户授权详情已接入统一 cursor pagination，默认 50 条并由对应页面的“加载更多”读取后续页面。
Generic Job 生命周期也已接入 `/admin/jobs`，支持状态/类型筛选和统一 cursor pagination；类型筛选覆盖平台会话归档、发送调度、能力探针等已登记 Job，并保留未知类型的自定义输入；列表只返回脱敏生命周期元数据，不开放事件 payload。

### M6 — V1.1

- SMS Binding：已完成 API、验证码短时输入通道、interactive worker 状态机和 Web 交互；真实平台 selector 仍需在 Sidecar 环境联调；
- Sticker 任务配置、`message.send_sticker` worker 路由和 fail-closed 校验；真实平台 Sidecar 实现仍待接入；
- 消息模板池：用户隔离的文字/贴纸模板 CRUD、统一 Web `/templates` 页面，以及任务编辑器的内容快照套用；
- 通知；
- Capability UI。

当前已完成 M6 的通知切片：新增 `notifications`、`notification_preferences`、`notification_deliveries` 持久化表、风险事件通知生成与去重、权益 7/3/1 天到期提醒、用户通知查询/单条已读/全部已读和微信通知偏好 API，以及统一 Web `/notifications` 页面；普通用户 `/settings` 展示账号信息与通知偏好，Web 端不伪造微信订阅授权，仅支持关闭已开启的微信通知。通知按账号所有者隔离，不返回 Session、Cookie 或风险详情。风险事件在同一事务写入微信 delivery 与 `notification.wechat.send` outbox，由 `worker-light` 负责微信订阅消息发送、状态记录和失败重试；权益到期提醒只写入站内通知，按 Grant 和阈值幂等，不进入微信投递链路。小程序“我的”页已提供订阅授权入口，真实模板配置和微信平台联调仍待完成。Sticker 已完成任务配置、契约和 browser worker 路由，真实平台发送仍等待 Sidecar 实现；SMS Binding 已完成端到端状态机和安全输入通道，真实抖音页面 selector 仍需 Sidecar 环境联调，Capability UI 已在账号页提供能力快照展示。Scheduler 现已增加登录态主动健康检查：按 30 分钟周期为绑定账号投递去重的 browser session-check Job，失效与安全验证沿用 Risk/站内通知闭环。
通知列表已接入统一 cursor pagination，默认 50 条并由 Web “加载更多”读取后续页面。Sticker
Sidecar 已冻结稳定目标/资源 ID 校验与未配置时的 fail-closed 响应，真实平台 selector 仍待联调。

消息模板池已完成用户隔离存储、OpenAPI/SDK、CRUD 页面和任务编辑器套用；模板套用保存为任务快照，不产生隐式联动。模板列表已接入统一 cursor pagination，默认 50 条，模板管理页和任务编辑器均支持继续加载。

账号 QR/SMS 绑定使用的统一 SSE 客户端现已支持断线续传：连接关闭或网络错误时自动重连，
通过 `Last-Event-ID` 避免重复消费已持久化事件；绑定页面沿用原有 AbortController 生命周期，
无需修改业务事件处理器。

账号检查、好友同步和账号详情操作也已复用同一 Job 事件等待器，不再以固定间隔轮询状态；
等待器在成功、失败、取消和超时后都会主动终止 SSE 连接，错误码继续交给现有通知语义展示。

### M7 — V1.2

- Protocol Adapter；
- Circuit Breaker；
- Creator First；
- 多 Worker 扩展；
- 多档权益方案与授权迁移策略。

会话归档已先完成用户侧索引闭环：新增 `archived_at`、归档/恢复 API、默认隐藏归档
查询、统一 Web 会话筛选与响应式操作按钮；会话页同时提供明确的“请求平台归档/恢复”操作，提交
后台 Job 后只反馈“已提交”，不提前假设平台状态；平台侧 `conversations.archive` Sidecar 输入契约
已冻结并保持 fail-closed，平台归档请求的 Job/Outbox、Browser Worker、账号锁与确认回执校验
已接线；真实 selector 和平台回执仍待适配器联调。

M7 的本地 Protocol 前置切片已完成 v1 envelope 加固和 `send.protocol` worker 控制面接线：
Go/Python 双侧校验 deadline、输入对象和未知字段，Go ProcessClient 还严格校验响应 envelope 的必填字段与 `error.detail` 对象边界，失败响应透传 `error.detail`，发送
outcome 未知时保持 fail-closed；真实 Protocol SDK 和平台 selector 仍不在本地猜测实现，
未部署时由带 `protocol.im` 身份的 unavailable client fail-closed，不会由 stub handler ACK，
也不会把协议任务误交给 Browser Sidecar。Creator 首聊已完成本地权益闸门：任务创建/编辑和
发送 worker 最终执行都会校验 `creator_first_message`，并为 `message.send_first` 预留
协议路由；Go `ProcessClient` 与 `packages/contracts/sidecar/v1.schema.json` 已冻结只含
`platform_user_id` 的输入契约，真实 Platform/Creator adapter 未部署时仍由 `protocol.im` lane
fail-closed，且不会把协议任务误交给 Browser Sidecar；
真实平台首聊动作仍等待 Sidecar SDK 与 selector 联调。
已实现的会话列表、平台归档、文本发送、贴纸发送和首聊操作也已同步到 operation-specific
Sidecar JSON Schema，并由契约检查覆盖未知嵌套字段；QR/SMS 登录、Session Validate 和
好友同步的输入边界也已同步，轮询在认证完成前仍允许省略导出路径。
Resolver 的 fallback 也会检查全局 Adapter health；Browser 被禁用或熔断时返回无 Adapter
的不可用计划，首聊则继续保留 `protocol.im` 路由身份并 fail-closed。
Protocol 发送在明确收到 `outcome=not_sent`（或 `platform_write_accepted=false`）且 Browser
能力可用时，会在同一 Intent 下创建 Browser attempt 2；未知结果不会自动重发。

多 Worker 扩展已补齐 Browser Semaphore 首个闭环：`worker-browser` 使用 Redis
`semaphore:browser` 共享全局容量，配置 `WORKER_BROWSER_CONCURRENCY` 与
`MAX_GLOBAL_BROWSERS` 分离，Sidecar 调用持有可续租的 TTL lease；Protocol/interactive
Worker 不占用该浏览器容量。真正的平台 selector 与 Sidecar SDK 仍需外部环境联调。

权益层已完成多档 Plan 的升级/降级迁移：Plan 暴露非价格性的 `migration_weight`（默认 1），
Redeem 与管理员 Grant 在已有有效/排程授权时，会在 User 锁与同一数据库事务内撤销旧 Grant，
按 `remaining_seconds * old_weight / new_weight` 向下取整折算剩余时间，再叠加本次时长创建新
Grant；迁移前后方案和折算秒数写入脱敏审计，不引入订单或支付概念。

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
