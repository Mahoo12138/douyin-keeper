# 数据库 Schema 与迁移约定

> 目标：把 `03-domain-data.md` 的领域模型冻结成可直接实现的 PostgreSQL Schema。本文以 PostgreSQL 17+ 为基线；业务代码只暴露 `public_id`，数据库内部关联使用 `BIGINT` 主键。

## 1. 基础约定

### 主键

每张业务表建议同时拥有：

- `id BIGINT GENERATED ALWAYS AS IDENTITY`：内部主键；
- `public_id UUID NOT NULL UNIQUE`：API 对外 ID，由应用层生成 UUIDv7/UUIDv4；
- 外键全部引用内部 `id`。

不把连续自增 ID 暴露给 C 端。

### 时间

- 数据库存储统一使用 `TIMESTAMPTZ`；
- API 使用 RFC 3339；
- `SparkTask.timezone` 保存 IANA timezone，例如 `Asia/Shanghai`；
- “每日一次”的 `local_date` 使用任务 timezone 计算，不使用服务器本地日期。

### 删除

核心业务数据默认软删除：

- `deleted_at TIMESTAMPTZ NULL`

Session、临时 Job Event 等允许按数据生命周期物理删除。

## 2. 用户与认证

### users

```sql
CREATE TABLE users (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id       UUID NOT NULL UNIQUE,
  role            TEXT NOT NULL DEFAULT 'user'
                  CHECK (role IN ('user', 'admin')),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'disabled')),
  display_name    TEXT NOT NULL DEFAULT '',
  timezone        TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
```

### auth_identities

```sql
CREATE TABLE auth_identities (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL
                    CHECK (provider IN ('local', 'wechat_mini')),
  provider_subject  TEXT NOT NULL,
  credential_hash   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_subject)
);
```

`local` 的 `provider_subject` 存规范化用户名，`credential_hash` 使用 Argon2id。`wechat_mini` 的 `provider_subject` 存后端规范化后的微信主体标识，不把 OpenID/UnionID 直接塞进 `users`。

### auth_sessions / auth_refresh_tokens / auth_link_codes

认证 Session 与一次性小程序绑定码为独立表：

- `auth_sessions`：服务器可整体撤销的登录 Session；
- `auth_refresh_tokens`：每次 Refresh rotation 生成一行，只保存 token keyed hash，并保留已使用记录用于 reuse detection；
- `auth_link_codes`：PC 生成、微信小程序首次绑定消费，只保存 keyed hash，默认 5 分钟过期。

详细生命周期见 `13-auth-entitlement-engineering.md`。


## 2.1 权益、卡密与授权

用户表不直接保存账号配额。配额来自当前有效 `entitlement_grants -> entitlement_plans`。系统内部没有订单、支付、价格或退款表。

### entitlement_plans

```sql
CREATE TABLE entitlement_plans (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id         UUID NOT NULL UNIQUE,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','disabled')),
  account_quota     INTEGER NOT NULL CHECK (account_quota >= 0),
  task_quota        INTEGER NOT NULL CHECK (task_quota >= 0),
  daily_send_quota  INTEGER NOT NULL CHECK (daily_send_quota >= 0),
  features_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### card_batches

```sql
CREATE TABLE card_batches (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id            UUID NOT NULL UNIQUE,
  entitlement_plan_id  BIGINT NOT NULL REFERENCES entitlement_plans(id),
  name                 TEXT NOT NULL,
  duration_days        INTEGER NOT NULL CHECK (duration_days > 0 AND duration_days <= 3660),
  quantity             INTEGER NOT NULL CHECK (quantity > 0),
  status               TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','disabled')),
  code_version         INTEGER NOT NULL DEFAULT 1 CHECK (code_version > 0),
  redeem_not_before    TIMESTAMPTZ,
  redeem_before        TIMESTAMPTZ,
  created_by           BIGINT NOT NULL REFERENCES users(id),
  note                 TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (redeem_before IS NULL OR redeem_not_before IS NULL OR redeem_before > redeem_not_before)
);
```

### card_codes

卡密明文不入库。`code_hash` 为 `HMAC-SHA-256(CARD_CODE_PEPPER_V{code_version}, normalized_code)`；`DK1/DK2` 前缀决定使用哪个密钥版本。

```sql
CREATE TABLE card_codes (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id          BIGINT NOT NULL REFERENCES card_batches(id) ON DELETE RESTRICT,
  code_hash         BYTEA NOT NULL UNIQUE,
  code_fingerprint  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'unused'
                    CHECK (status IN ('unused','redeemed','revoked')),
  redeemed_by       BIGINT REFERENCES users(id),
  redeemed_at       TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  revoked_by        BIGINT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status = 'unused' AND redeemed_by IS NULL AND redeemed_at IS NULL AND revoked_at IS NULL)
    OR (status = 'redeemed' AND redeemed_by IS NOT NULL AND redeemed_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND redeemed_by IS NULL AND redeemed_at IS NULL AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX ix_card_codes_batch_status
  ON card_codes(batch_id, status);
```

### entitlement_grants

```sql
CREATE TABLE entitlement_grants (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id            UUID NOT NULL UNIQUE,
  user_id              BIGINT NOT NULL REFERENCES users(id),
  entitlement_plan_id  BIGINT NOT NULL REFERENCES entitlement_plans(id),
  source_type          TEXT NOT NULL
                       CHECK (source_type IN ('card','admin')),
  source_card_id       BIGINT UNIQUE REFERENCES card_codes(id),
  starts_at            TIMESTAMPTZ NOT NULL,
  expires_at           TIMESTAMPTZ NOT NULL,
  revoked_at           TIMESTAMPTZ,
  revoked_by           BIGINT REFERENCES users(id),
  revoke_reason        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at),
  CHECK ((source_type = 'card' AND source_card_id IS NOT NULL)
      OR (source_type = 'admin' AND source_card_id IS NULL))
);

CREATE INDEX ix_entitlement_grants_user_time
  ON entitlement_grants(user_id, starts_at, expires_at)
  WHERE revoked_at IS NULL;
```

EffectiveEntitlement 查询规则：

```text
starts_at <= now < expires_at AND revoked_at IS NULL
```

MVP 兑换时锁定 User 行，并把新授权排在用户最后一个未撤销 Grant 之后：

```text
anchor = max(now, max(expires_at))
starts_at = anchor
expires_at = anchor + duration_days
```

这样并发兑换不会产生重叠授权，提前续期也不会损失剩余时间。详见 `12-card-code-entitlement.md`。


### entitlement_daily_usage

产品级每日发送配额使用独立原子计数器，不通过运行时 `COUNT(send_jobs)` 做并发判断：

```sql
CREATE TABLE entitlement_daily_usage (
  user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date             DATE NOT NULL,
  reserved_send_count    INTEGER NOT NULL DEFAULT 0 CHECK (reserved_send_count >= 0),
  succeeded_send_count   INTEGER NOT NULL DEFAULT 0 CHECK (succeeded_send_count >= 0),
  failed_send_count      INTEGER NOT NULL DEFAULT 0 CHECK (failed_send_count >= 0),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, local_date)
);
```

同一 SendIntent 的重试不重复占用 quota；永久失败、取消或 skipped 时释放 reservation。

## 3. 抖音账号

### douyin_accounts

```sql
CREATE TABLE douyin_accounts (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id              UUID NOT NULL UNIQUE,
  user_id                BIGINT NOT NULL REFERENCES users(id),
  platform_user_id       TEXT,
  nickname               TEXT NOT NULL DEFAULT '',
  avatar_url             TEXT,
  binding_status         TEXT NOT NULL DEFAULT 'unbound'
                         CHECK (binding_status IN ('unbound','binding','bound','released')),
  session_status         TEXT NOT NULL DEFAULT 'unknown'
                         CHECK (session_status IN ('unknown','valid','expired','challenge_required')),
  risk_status            TEXT NOT NULL DEFAULT 'normal'
                         CHECK (risk_status IN ('normal','cooling_down','paused')),
  paused_at              TIMESTAMPTZ,
  cooldown_until         TIMESTAMPTZ,
  last_session_check_at  TIMESTAMPTZ,
  last_friend_sync_at    TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ
);

CREATE UNIQUE INDEX ux_douyin_account_user_platform
  ON douyin_accounts(user_id, platform_user_id)
  WHERE platform_user_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX ix_douyin_accounts_user
  ON douyin_accounts(user_id)
  WHERE deleted_at IS NULL;
```

不要把 `prefer_protocol` 之类的实现偏好写入账号主表。Adapter 选择由 Capability + 系统策略决定。

## 4. Session Envelope

### account_sessions

```sql
CREATE TABLE account_sessions (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id         BIGINT NOT NULL REFERENCES douyin_accounts(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  key_version        INTEGER NOT NULL,
  cipher_alg         TEXT NOT NULL DEFAULT 'AES-256-GCM',
  ciphertext         BYTEA NOT NULL,
  aad_version        INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_validated_at  TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  UNIQUE(account_id, version)
);

CREATE UNIQUE INDEX ux_account_sessions_active
  ON account_sessions(account_id)
  WHERE revoked_at IS NULL;
```

建议 AAD 至少绑定：

```text
session:v1:user/{user_public_id}:account/{account_public_id}:key/{key_version}
```

普通 Repository 不提供“列出 Session 明文”的方法。解密入口只存在于 Worker 的 SessionService。

## 5. 好友与会话

### friends

```sql
CREATE TABLE friends (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id         UUID NOT NULL UNIQUE,
  account_id        BIGINT NOT NULL REFERENCES douyin_accounts(id) ON DELETE CASCADE,
  platform_user_id  TEXT,
  identity_status   TEXT NOT NULL DEFAULT 'pending'
                    CHECK (identity_status IN ('pending','resolved','ambiguous','missing')),
  display_name      TEXT NOT NULL DEFAULT '',
  nickname          TEXT NOT NULL DEFAULT '',
  short_id          TEXT,
  avatar_url        TEXT,
  streak_days       INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  has_conversation  BOOLEAN NOT NULL DEFAULT false,
  spark_enabled     BOOLEAN NOT NULL DEFAULT false,
  last_seen_at      TIMESTAMPTZ,
  last_sent_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX ux_friend_account_platform
  ON friends(account_id, platform_user_id)
  WHERE platform_user_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX ix_friends_account_active
  ON friends(account_id, spark_enabled)
  WHERE deleted_at IS NULL;
```

`identity_status != 'resolved'` 时，自动发送必须 fail closed。

### conversations

```sql
CREATE TABLE conversations (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id                 UUID NOT NULL UNIQUE,
  account_id                BIGINT NOT NULL REFERENCES douyin_accounts(id) ON DELETE CASCADE,
  friend_id                 BIGINT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  platform_conversation_id  TEXT NOT NULL,
  channel                   TEXT NOT NULL
                            CHECK (channel IN ('consumer','creator')),
  last_message_at           TIMESTAMPTZ,
  last_synced_at            TIMESTAMPTZ,
  archived_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, platform_conversation_id),
  UNIQUE(account_id, friend_id, channel)
);
```

## 5.1 消息模板

### message_templates

```sql
CREATE TABLE message_templates (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id   UUID NOT NULL UNIQUE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('text','sticker')),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CHECK (char_length(body) BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX ux_message_template_user_name
  ON message_templates(user_id, name) WHERE deleted_at IS NULL;
CREATE INDEX ix_message_template_user_updated
  ON message_templates(user_id, updated_at DESC) WHERE deleted_at IS NULL;
```

模板删除使用软删除，任务不会持有模板外键；任务套用模板时保存内容快照。

## 6. 火花任务

### spark_tasks

```sql
CREATE TABLE spark_tasks (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id            UUID NOT NULL UNIQUE,
  user_id              BIGINT NOT NULL REFERENCES users(id),
  account_id           BIGINT NOT NULL REFERENCES douyin_accounts(id) ON DELETE CASCADE,
  friend_id            BIGINT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  enabled              BOOLEAN NOT NULL DEFAULT true,
  timezone             TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  window_start         TIME NOT NULL,
  window_end           TIME NOT NULL,
  message_kind         TEXT NOT NULL DEFAULT 'text'
                       CHECK (message_kind IN ('text','sticker')),
  message_body         TEXT,
  allow_first_message  BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);

CREATE UNIQUE INDEX ux_task_account_friend
  ON spark_tasks(account_id, friend_id)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_task_scheduler
  ON spark_tasks(enabled, account_id)
  WHERE deleted_at IS NULL;
```

MVP 要求 `window_start < window_end`，不支持跨午夜窗口。后续如需跨午夜，再单独扩展，不在第一版把调度规则复杂化。

## 7. Intent 与 Job

### send_intents

```sql
CREATE TABLE send_intents (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id       UUID NOT NULL UNIQUE,
  intent_type     TEXT NOT NULL
                  CHECK (intent_type IN ('scheduled','manual')),
  request_id      UUID,
  task_id         BIGINT REFERENCES spark_tasks(id) ON DELETE SET NULL,
  account_id      BIGINT NOT NULL REFERENCES douyin_accounts(id),
  friend_id       BIGINT NOT NULL REFERENCES friends(id),
  local_date      DATE,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','queued','running','retry_wait','succeeded','failed','skipped','cancelled')),
  error_code      TEXT,
  next_attempt_at TIMESTAMPTZ,
  last_job_id     BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (intent_type = 'scheduled' AND task_id IS NOT NULL AND local_date IS NOT NULL)
    OR
    (intent_type = 'manual' AND request_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX ux_send_intent_scheduled
  ON send_intents(task_id, local_date)
  WHERE intent_type = 'scheduled';

CREATE UNIQUE INDEX ux_send_intent_manual_request
  ON send_intents(request_id)
  WHERE intent_type = 'manual';

CREATE INDEX ix_send_intent_due
  ON send_intents(status, scheduled_at);
```

### send_jobs

```sql
CREATE TABLE send_jobs (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id             UUID NOT NULL UNIQUE,
  intent_id             BIGINT NOT NULL REFERENCES send_intents(id) ON DELETE CASCADE,
  account_id            BIGINT NOT NULL REFERENCES douyin_accounts(id),
  friend_id             BIGINT NOT NULL REFERENCES friends(id),
  attempt               INTEGER NOT NULL CHECK (attempt >= 1),
  selected_adapter      TEXT,
  status                TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  error_code            TEXT,
  retryable             BOOLEAN NOT NULL DEFAULT false,
  platform_message_id   TEXT,
  worker_id             TEXT,
  heartbeat_at          TIMESTAMPTZ,
  lease_expires_at      TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  finished_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(intent_id, attempt)
);

ALTER TABLE send_intents
  ADD CONSTRAINT fk_send_intent_last_job
  FOREIGN KEY (last_job_id) REFERENCES send_jobs(id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX ix_send_jobs_account_created
  ON send_jobs(account_id, created_at DESC);
```

核心事务顺序改为 Transactional Outbox：

```text
BEGIN
  lock daily quota row
  INSERT send_intent ... ON CONFLICT DO NOTHING
  若 INSERT 成功：reserve quota + INSERT queue_outbox(send.dispatch)
COMMIT
```

commit 后由 Outbox Publisher 投递 Asynq，避免 DB 与 Redis 双写窗口。

## 8. Job 与 Job Event

所有长任务统一使用通用 Job 表，不仅限于发送：

```sql
CREATE TABLE jobs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id     UUID NOT NULL UNIQUE,
  user_id       BIGINT REFERENCES users(id),
  account_id    BIGINT REFERENCES douyin_accounts(id),
  type          TEXT NOT NULL,
  status        TEXT NOT NULL
                CHECK (status IN ('queued','running','waiting_user','succeeded','failed','cancelled')),
  error_code    TEXT,
  cancelable    BOOLEAN NOT NULL DEFAULT false,
  cancel_requested_at TIMESTAMPTZ,
  worker_id     TEXT,
  heartbeat_at  TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ
);

CREATE TABLE job_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id        BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  seq           BIGINT NOT NULL,
  event_type    TEXT NOT NULL,
  payload_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, seq)
);
```

SSE 可先从 Redis Pub/Sub 实时推送，同时把非敏感事件写 `job_events` 便于断线重放。


## 8.1 Transactional Outbox

业务事务不直接 enqueue Redis。所有需要跨事务触发 Worker 的动作在同一 PostgreSQL 事务内写 `queue_outbox`，由独立 Publisher 使用 `FOR UPDATE SKIP LOCKED` 投递 Asynq。

```sql
CREATE TABLE queue_outbox (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id         UUID NOT NULL UNIQUE,
  kind              TEXT NOT NULL,
  aggregate_type    TEXT NOT NULL,
  aggregate_id      TEXT NOT NULL,
  payload_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','publishing','published','dead')),
  available_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts          INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at   TIMESTAMPTZ,
  dedupe_key        TEXT NOT NULL UNIQUE,
  locked_by         TEXT,
  locked_until      TIMESTAMPTZ,
  last_error_code   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at      TIMESTAMPTZ
);
```

数据库是真实业务状态源，Asynq 只负责传输。详见 `15-scheduler-worker-state-machine.md`。

## 8.2 Notification Delivery

```sql
CREATE TABLE notification_preferences (
  user_id        BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  wechat_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_deliveries (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('wechat')),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','skipped','failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_at   TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(notification_id, channel)
);
```

风险通知事务同时写入站内通知、微信 delivery 和 `queue_outbox`；delivery 不保存
微信凭据，worker 运行时从 `auth_identities.provider_subject` 读取发送目标。

## 9. Capability 与 Adapter Health

```sql
CREATE TABLE capability_snapshots (
  account_id      BIGINT NOT NULL REFERENCES douyin_accounts(id) ON DELETE CASCADE,
  capability      TEXT NOT NULL,
  status          TEXT NOT NULL
                  CHECK (status IN ('available','degraded','unavailable','unknown')),
  adapter          TEXT,
  error_code       TEXT,
  checked_at       TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(account_id, capability)
);

CREATE TABLE adapter_health (
  adapter          TEXT PRIMARY KEY,
  status           TEXT NOT NULL
                   CHECK (status IN ('healthy','degraded','open','disabled')),
  version          TEXT,
  error_code       TEXT,
  failure_count    INTEGER NOT NULL DEFAULT 0,
  circuit_open_until TIMESTAMPTZ,
  checked_at       TIMESTAMPTZ NOT NULL
);
```

全局 `adapter_health.protocol.im = open` 时，Resolver 不应让每个账号再次试错。

## 10. Risk / Audit / Settings

```sql
CREATE TABLE risk_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id       UUID NOT NULL UNIQUE,
  account_id      BIGINT NOT NULL REFERENCES douyin_accounts(id) ON DELETE CASCADE,
  category        TEXT NOT NULL
                  CHECK (category IN ('AUTH','PLATFORM','PROTOCOL','BROWSER','NETWORK','DATA')),
  code            TEXT NOT NULL,
  severity        TEXT NOT NULL
                  CHECK (severity IN ('info','warning','critical')),
  source_adapter  TEXT,
  detail_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  action          TEXT,
  cooldown_until  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_risk_account_created
  ON risk_events(account_id, created_at DESC);

CREATE TABLE audit_logs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id),
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  request_id    UUID,
  ip_hash       TEXT,
  detail_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE site_settings (
  key           TEXT PRIMARY KEY,
  value_json    JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Audit 中不记录 Cookie、短信验证码、Session ciphertext 明文解密结果。

## 11. 数据访问边界

C 端 Repository 的任何账号关联查询，都必须同时限定当前用户：

```sql
SELECT f.*
FROM friends f
JOIN douyin_accounts a ON a.id = f.account_id
WHERE f.public_id = $1
  AND a.user_id = $2
  AND a.deleted_at IS NULL
  AND f.deleted_at IS NULL;
```

Admin 使用独立 Repository / Policy，不通过隐藏的 `is_admin` 参数复用 C 端 Repository。

## 12. Migration 顺序

建议第一批 migration：

```text
000001_users_auth.sql
000002_auth_sessions_refresh_link_codes.sql
000003_entitlement_cards.sql
000004_douyin_accounts_sessions.sql
000005_friends_conversations.sql
000006_spark_tasks.sql
000007_send_intents_jobs.sql
000008_jobs_events.sql
000009_queue_outbox.sql
000010_capabilities_risk.sql
000011_admin_audit_settings.sql
000012_indexes.sql
```

原则：migration 只前进，不修改已发布 migration；修复通过新 migration 完成。

当前仓库实际迁移已包含：`000001_init.sql`、`000002_notifications.sql`、
`000003_message_templates.sql`、`000004_wechat_notifications.sql`、
`000005_conversation_archive.sql`；后续结构变更继续追加新文件。

## 13. MVP 冻结项

正式编码前冻结：

1. `platform_user_id` 是好友稳定主身份；
2. `conversation_id` 只用于会话路由，不能替代好友身份；
3. Scheduled Intent 唯一键为 `(task_id, local_date)`；
4. Manual Intent 使用客户端生成的 `request_id` 幂等；
5. Session 独立表 + Envelope；
6. Capability 与 SessionStatus 分离；
7. 所有 C 端资源查询必须经 user scope；
8. 自动发送只对 `identity_status=resolved` 的好友开放；
9. Auth 使用可撤销 Refresh Session，微信小程序首次登录通过一次性 Link Code 绑定已有 User；
10. Entitlement 配额不存 User 主表，每日发送额度由 `entitlement_daily_usage` 原子预留；
11. DB -> Queue 使用 Transactional Outbox，不直接双写 PostgreSQL + Redis；
12. Worker 使用 DB lease + Redis Account Lock 两层机制。
