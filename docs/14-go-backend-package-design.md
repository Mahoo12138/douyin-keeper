# Go 后端 Package 与工程边界设计

> 目标：让 API、Scheduler、多个 Worker 共用同一个 Go 领域实现，同时避免 Handler、SQL、Asynq、Sidecar 调用互相渗透。建议采用单 Go Module、多 `cmd` 入口。

## 1. 推荐仓库落位

```text
douyin-keeper/
├─ backend/
│  ├─ go.mod
│  ├─ cmd/
│  │  ├─ api/
│  │  ├─ migrate/
│  │  ├─ scheduler/
│  │  ├─ worker-interactive/
│  │  ├─ worker-browser/
│  │  └─ worker-light/
│  │
│  ├─ internal/
│  │  ├─ auth/
│  │  ├─ entitlement/
│  │  ├─ account/
│  │  ├─ session/
│  │  ├─ friend/
│  │  ├─ conversation/
│  │  ├─ task/
│  │  ├─ send/
│  │  ├─ job/
│  │  ├─ capability/
│  │  ├─ risk/
│  │  ├─ scheduler/
│  │  ├─ dispatch/
│  │  ├─ sidecar/
│  │  ├─ platform/douyin/
│  │  ├─ transport/httpapi/
│  │  ├─ webassets/          # go:embed Web/Admin release assets
│  │  ├─ transport/asynqworker/
│  │  └─ infra/
│  │     ├─ postgres/
│  │     ├─ redislock/
│  │     ├─ asynqqueue/
│  │     ├─ cryptox/
│  │     ├─ clock/
│  │     └─ telemetry/
│  │
│  └─ migrations/ -> ../db/migrations 或仅引用根目录
│
├─ sidecars/
├─ packages/contracts/
├─ db/migrations/
└─ docs/
```

`infra/telemetry` 同时承载 JSON 结构化日志和进程级 Prometheus 指标。API 的
`GET /metrics` 与 Scheduler/Worker 的 `METRICS_ADDR` 只输出受控低基数标签；业务模块
通过可选的 Metrics 注入记录 Job、Send、风险、Adapter 健康、浏览器槽位、微信通知和
队列延迟，不把观测依赖反向耦合到领域层。

相比 `services/api` 与 `services/worker` 两个独立 Go 项目，单 Module 更适合当前规模：业务模型和 Repository Contract 只维护一份，但可编译成多个独立二进制。


## 1.1 Frontend Embed Boundary

`backend/internal/transport/webassets` 是 Backend 的发布适配层，而不是前端源码目录。前端源码统一位于 `apps/web`，普通用户路由与 `/admin/*` 管理路由在同一个 TanStack App 内分组。Release Docker build 负责把它的 `dist` 复制到：

```text
backend/internal/transport/webassets/dist/web
```

然后 `cmd/api` 通过 `internal/transport/webassets` 提供静态文件和 SPA fallback。Domain package 不得依赖 Web assets。

开发模式允许 Vite 独立运行；`go:embed` 是生产交付契约。

### 1.2 Web Feature Boundary

Web 路由文件只负责 TanStack Router 的 route 配置和页面装配；业务数据读取统一经过
`packages/sdk-ts`，服务端状态统一由 TanStack Query 管理。具体页面按领域放在
`apps/web/src/features/<domain>/`，领域目录内再拆分列表、状态展示、长任务面板等组件。
例如账号页的 QR 绑定、账号列表和 capability 快照位于 `features/accounts`，而
`routes/(root)/accounts.tsx` 只保留 route 声明。这一层次与 `reference/tinyship-main/apps/tanstack-app`
的 route/component 分工一致，也保证后续 Web C、Admin 可以复用 contracts、SDK 和基础 UI，
而不共享带业务状态的页面组件。

## 2. 依赖方向

硬规则：

```text
cmd
 ↓
transport
 ↓
application/domain packages
 ↑
infra implements interfaces
```

禁止：

```text
auth -> httpapi
send -> asynq
account -> postgres
entitlement -> redis
platform/douyin -> handler
```

Domain/Application package 可以定义接口，Infra 实现接口。

## 3. Package 风格

不推荐建立一个巨大的：

```text
models/
repositories/
services/
handlers/
```

这种按技术层全局切分的结构会让一个业务改动横跨整个仓库。

推荐 bounded context：

```text
internal/entitlement/
├─ model.go
├─ service.go
├─ repository.go
├─ policy.go
├─ errors.go
└─ testdata/
```

SQL 实现在：

```text
internal/infra/postgres/entitlement_repo.go
```

HTTP Handler 在：

```text
internal/transport/httpapi/entitlement_handler.go
```

## 4. 核心 Package 职责

### `auth`

拥有：

- User Principal；
- Local/Wechat Identity；
- AuthSession；
- Password hashing contract；
- Token issuing/refresh/revoke；
- Link Code 生命周期。

不拥有：

- Entitlement；
- HTTP Cookie 具体写法；
- 微信 HTTP Client 具体实现。

### `entitlement`

拥有：

- Plan；
- CardBatch/CardCode；
- Grant；
- EffectiveEntitlement；
- Feature/Quota policy；
- Redeem/Grant/Revoke。

不依赖：Account/Task concrete repository。

跨上下文配额检查通过小接口注入，或者由具体 UseCase 在事务中组合。

### `account`

拥有：

- DouyinAccount；
- Binding 生命周期；
- Pause/Resume/Release；
- 用户资源归属。

不解密 Session，不调用 Playwright。

### `session`

拥有：

- AccountSession Envelope；
- Encrypt/Decrypt；
- Version/KeyVersion；
- Revoke/Replace；
- SessionStatus 的领域更新。

明文 StorageState 的生命周期只存在于 Worker UseCase 内。

### `friend`

拥有：

- Friend；
- stable `platform_user_id`；
- identity resolution 状态；
- Sync 后的 upsert 规则。

### `conversation`

拥有：

- platform conversation identity；
- friend/conversation 一致性；
- consumer/creator channel。
- 用户侧归档状态的查询与恢复。

不负责直接操作抖音平台归档；平台侧动作必须通过版本化 Sidecar 能力和 Job 流程接入。

### `task`

拥有：

- SparkTask；
- schedule window；
- timezone/local date；
- enable/delete。

不负责真正 Tick。

### `send`

拥有：

- SendIntent；
- SendJob；
- Message Spec；
- attempt/final result；
- Intent state machine。

它不直接 import Protocol/Playwright。

### `job`

通用长任务：

- QR binding；
- SMS binding（未来）；
- Session Check；
- Friends Sync；
- Job Event；
- Cancel request；
- Lease/heartbeat。

不要用通用 Job 替代 SendIntent/SendJob 的领域状态。

### `capability`

拥有：

- Account capability snapshot；
- Adapter health；
- Capability resolver policy。

当前实现：账号 QR 绑定成功后在同一事务写入 `capability.probe` outbox，
`worker-light` 调用 Sidecar `health.check` 并 upsert `capability_snapshots`。
发送 Worker 在调用 Sidecar 前必须确认 `message.send.text.existing` 为
`available`；缺失、未探测或不可用均 fail closed。全局
`adapter_health` 由同一探测事务更新：连续 3 次健康/兼容性失败进入
`open` 10 分钟，发送 Worker 在 open 期间不调用 Sidecar；成功探测或确认发送
后清零失败计数。健康结果带有 `checked_at`，Repository 只接受不早于当前记录的
观测，避免异步 probe/send 结果乱序覆盖更新的成功或失败。Scheduler 每 10 分钟扫描
过期 snapshot，通过 outbox 投递新的 `capability.probe`。`disabled` 状态只允许管理
策略显式恢复。

`account` 同时提供 Scheduler 使用的 `SessionCheckRepository` 投影：每 30 分钟扫描
绑定且 Session 为 `unknown/valid`、`last_session_check_at` 已过期的账号，并排除已有
活动或周期内新建 session-check Job 的账号。Scheduler 在同一事务内写入通用 Job 与
`account.session_check.browser` outbox；Worker 的失效/安全验证结果继续交给
`risk.Service`，由现有站内通知链路提醒账号所有者。

发送 dispatch 已接入 Resolver：按消息类型、会话存在性和
`allow_first_message` 生成候选路由，并把计划 Adapter 写入
`send_jobs.selected_adapter`。当前部署只注册 `browser.consumer` 为可执行运行时；普通
已有会话不会路由到未注册的 `protocol.im`。首聊没有安全的 Browser fallback，因此仍保留
`protocol.im` 的 `send.protocol` 控制面计划，由 `worker-light` 的显式 unavailable client
返回带 `protocol.im` 身份的 `ADAPTER_UNAVAILABLE`，不会误调用 Browser Sidecar，也不会
由 stub handler ACK。Resolver 的健康/能力判断只是计划路由，Worker 的 preflight 仍是最后一道门。

Task Service 在开启 `allow_first_message` 时要求 Entitlement Gate 的
`creator_first_message` feature；Browser Worker 执行前以任务快照再次校验，确保权益撤销
后不会通过旧任务配置发送首聊。关闭该配置可用于恢复普通已存在会话发送。

### `risk`

拥有：

- RiskEvent；
- error category；
- cooldown/pause action policy。

当前实现：Worker 将 Sidecar/平台稳定错误交给 `risk.Service`，由事务同时写入
`risk_events` 与账号 Session/cooldown 状态；Scheduler 的 risk cleanup 会把已过期
`cooling_down` 账号恢复为 `normal`。用户 `paused_at`、风险 cooldown 和 Session
状态在发送 Worker 最终 preflight 中分别检查。

### `scheduler`

只负责：

- 找出 due SparkTask；
- 创建 Scheduled SendIntent；
- 不直接发送消息。

### `dispatch`

负责：

- 将 Intent 变成 SendJob attempt；
- Adapter 选择；
- retry policy；
- finalization；
- quota reservation finalize/release。

### `sidecar`

定义 Go 侧协议抽象：

```go
type Client interface {
    Call(ctx context.Context, req Request) (Response, error)
}
```

并负责：

- NDJSON encode/decode；
- deadline；
- process/socket transport；
- output secret redaction；
- protocol version check。

### `platform/douyin`

只放抖音业务映射：

- capability name；
- Sidecar op 到领域结果转换；
- Douyin error -> stable ErrorCode；
- Adapter implementations。

禁止把 XPath、Cookie 名称、Webpack 逻辑移回 Go。

## 5. UseCase 与跨 Context 编排

某些操作天然横跨多个 package，不要为了“纯领域”强行塞进单个实体。

建议在对应业务 package 的 Service 或小型 UseCase 中编排。

### CreateAccountBinding

```text
Auth Principal
  ↓
Entitlement Authorize(account.bind)
  ↓
Transaction
  ├─ lock User
  ├─ count Account quota
  ├─ create Account(binding)
  ├─ create Job(queued)
  └─ create Outbox(account.bind.qr)
```

### CreateTask

```text
validate account ownership
validate friend ownership + resolved identity
Entitlement Authorize(task.create)
Transaction
  ├─ lock User
  ├─ task quota check
  └─ create SparkTask
```

### CreateSendIntent

```text
Task/Manual request
  ↓
Entitlement Authorize(send.execute)
  ↓
validate account/session/risk/friend
  ↓
Transaction
  ├─ reserve daily quota
  ├─ create SendIntent
  └─ create Outbox(send.dispatch)
```

## 6. Transaction API

不要让业务层直接传播 `*sql.Tx`。

推荐定义：

```go
type TxManager interface {
    WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
```

Postgres Repository 从 context 中取得当前 transaction handle；没有 Tx 时使用 pool。

这样 Service 只表达“这一组动作需要同事务”，不依赖 pgx/sql 具体类型。

规则：

- Tx 内禁止调用 Sidecar；
- Tx 内禁止发 HTTP；
- Tx 内禁止直接 enqueue Redis；
- 外部副作用通过 Outbox 在 commit 后发生。

## 7. Repository Contract

Repository 返回领域对象，不返回 ORM/pgx Row。

例：

```go
type AccountRepository interface {
    GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (Account, error)
    CountQuotaOccupied(ctx context.Context, userID int64) (int, error)
    Create(ctx context.Context, a *Account) error
    UpdateSessionStatus(ctx context.Context, accountID int64, status SessionStatus, at time.Time) error
}
```

C 端资源必须使用 `GetOwned` 一类 API，避免 Handler 先 Get 再自己比较 `user_id`。

Admin Repository 单独定义：

```text
AdminAccountQuery
AdminUserQuery
```

不通过参数绕开所有权。

## 8. ID 规则

领域内部：

```text
int64 DB ID
```

边界/API：

```text
UUID public ID
```

Handler 第一层将 public UUID resolve 成 owned internal ID，之后 Service 不反复处理字符串 ID。

平台 ID：

```text
Douyin platform_user_id = string
conversation_id = string
```

禁止强转成整数，避免未来格式变化。

## 9. Error 模型

每个 package 可以有 typed domain error，但最终映射成统一 ErrorCode：

```go
type AppError struct {
    Code      string
    Kind      ErrorKind
    Retryable bool
    SafeMsg   string
    Cause     error
}
```

`Cause` 不直接返回 API。

ErrorKind：

```text
validation
unauthenticated
forbidden
not_found
conflict
quota
external
transient
internal
```

HTTP 层统一映射：

```text
400 validation
401 unauthenticated
403 forbidden/entitlement
404 not_found
409 conflict/quota/idempotency
429 rate_limited
503 external unavailable
500 internal
```

平台错误码仍使用 `SESSION_EXPIRED`、`CHALLENGE_REQUIRED`、`ADAPTER_INCOMPATIBLE` 等稳定码。

## 10. Outbox Contract

定义：

```go
type Outbox interface {
    Add(ctx context.Context, msg Message) error
}
```

必须在业务事务内调用。

Message：

```text
id
kind
aggregate_type
aggregate_id
payload
available_at
dedupe_key
```

Outbox Publisher 是 Infra/Application 边界，不属于具体领域。

Asynq Task Payload 只放稳定 ID：

```json
{
  "outbox_id": "...",
  "job_id": "..."
}
```

或者：

```json
{
  "intent_id": "..."
}
```

不要把 Session、CardCode、Message Secret 塞进 Redis task body。

## 11. API Binary

`cmd/api/main.go` 只做 composition root：

```text
load config
connect postgres/redis
build repositories
build services
build auth/token components
build router
start HTTP
shutdown gracefully
```

禁止在 main 中写业务逻辑。

## 12. Scheduler Binary

`cmd/scheduler`：

- leader election；
- Tick due tasks；
- retry due intents；
- SendJob 与 Generic Job lease recovery；
- binding Job 超时后的账号状态清理；
- risk cooldown cleanup；
- 不运行浏览器；
- 不直接消费发送队列。

MVP 单实例也保留 leader lock，便于以后水平扩容。

## 13. Worker Binaries

### worker-interactive

处理：

```text
account.bind.qr
account.bind.sms.* (future)
```

### worker-browser

处理：

```text
account.session_check.browser
account.friends_sync.browser
send.browser
```

并持有 Browser Semaphore。

### worker-light

处理：

```text
send.protocol
capability.probe
notification.wechat.send
small reconciliation jobs
```

`notification` domain 只定义偏好、站内通知和 delivery repository contract；微信 HTTP
客户端位于 `infra/wechat`，`transport/asynqworker` 负责从 outbox payload 加载通知并
执行发送。发送失败标记为 `failed` 后返回错误，让 Asynq 按队列策略重试；未订阅或未
配置模板则标记为 `skipped`。

Outbox Publisher 可以独立 goroutine 运行在 scheduler，或单独编译一个轻量进程；不要运行在每个 worker 中重复抢同一批消息，除非实现 `FOR UPDATE SKIP LOCKED`。

## 14. Config

配置按用途分组：

```text
HTTP
Postgres
Redis
Auth
Crypto
CardCodePepper
Queue
Scheduler
Worker
Sidecar
Telemetry
SitePolicy
```

浏览器 Worker 的容量配置必须同时保留进程内与跨进程两个维度：

```text
WORKER_BROWSER_CONCURRENCY  # 单个 worker-browser 的 Asynq queue concurrency
MAX_GLOBAL_BROWSERS         # 所有 worker-browser 进程共享的 Redis semaphore 上限
BROWSER_SEMAPHORE_TTL       # 浏览器 Sidecar 调用的租约 TTL，默认 2m，调用期间自动续租
```

全局 key 固定为 `semaphore:browser`，由 `infra/redislock` 使用 owner token 和过期租约
保证释放安全；`worker-light` 与 `worker-interactive` 不接入该 semaphore。

Secret 只从环境变量/Secret Manager 注入。

不要提交真实 `.env`。

## 15. Logging / Trace

所有 API / Queue / Sidecar 调用贯穿：

```text
request_id
trace_id
job_public_id
account_public_id
intent_public_id
```

日志统一结构化。

永不记录：

```text
Authorization
Cookie
Refresh Token
Card Code
Playwright storage_state
SMS code
Session plaintext/ciphertext
```

## 16. 测试层次

### Unit

- entitlement policy；
- schedule window；
- state transition；
- retry classifier；
- adapter resolver。

Adapter fallback 只接受适配器明确提供的 `outcome=not_sent`（或等价的
`platform_write_accepted=false`）证据；超时、进程读写失败和 lease 过期都属于
未知结果，不允许创建下一次发送。

### Repository Integration

使用真实 PostgreSQL：

- unique constraints；
- `FOR UPDATE`；
- SKIP LOCKED；
- user scope；
- outbox atomicity。

### Service Integration

- 并发兑换；
- quota race；
- create intent + outbox；
- retry attempt；
- lease recovery。

### Contract

- OpenAPI；
- Sidecar JSON Schema；
- stable ErrorCode。

## 17. 首批实现顺序

建议 Go 端按：

```text
1. infra/postgres + TxManager
2. auth
3. entitlement
4. outbox
5. account + session
6. job
7. friend + conversation
8. task
9. send intent/job
10. scheduler + dispatch
11. sidecar client
12. capability + risk
```

这样在接 Playwright 之前，账号、授权、Job、Intent 和队列语义已经可以完整做集成测试。

## 16. Container Binary Strategy

Backend Image 输出：

```text
/app/backend
/app/migrate
```

Worker Image 输出：

```text
/app/scheduler
/app/worker-interactive
/app/worker-browser
/app/worker-light
```

所有 Worker 二进制共享同一 `go.mod`、领域 package 与 Worker 镜像，但作为独立进程运行。这样 Docker Compose 可以按 pool 单独设置重启策略、资源限制、扩容数量和 `shm_size`，而不会重新引入多个 Go 项目的代码重复。详细见 `16-deployment-packaging.md`。
