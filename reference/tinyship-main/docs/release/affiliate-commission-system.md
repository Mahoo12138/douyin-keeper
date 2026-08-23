# TinyShip — Affiliate Commission System 返利佣金系统上线

本版本为 TinyShip 新增完整的 **Affiliate Commission System（返利佣金系统）**，用户可通过专属推荐链接邀请新用户注册，在被推荐用户的每笔消费中自动获得现金佣金，并支持提现申请与管理员审批的全闭环流程。

系统已统一集成全部六大支付提供商（Stripe、PayPal、Creem、WeChat Pay、Alipay、DodoPayments），三个框架同步适配，同时兼容 PostgreSQL 和 SQLite 双数据库。

### 核心新增

**推荐链接与自动归因**：用户在 Dashboard 获取专属推荐链接（如 `https://yourapp.com?ref=aB3xK9mZ`），被推荐人点击后推荐码自动写入 Cookie（30 天有效），注册后首次访问仪表盘即完成推荐关系绑定

系统包含两套独立的奖励机制：

**1) 注册积分奖励（Credits Bonus）**：被推荐用户完成注册绑定时立即触发，推荐人和被推荐人各获得可配置的积分奖励（默认各 10 积分），通过积分系统 `creditService.addCredits` 发放，进入用户积分余额

**2) 消费现金佣金（Commission）**：被推荐用户的每笔成功付款（订阅 / 单次付费 / 积分充值）均自动触发佣金计算，支持百分比（默认 20%）和固定金额两种模式，佣金进入推荐人的 `commissionBalance` 现金余额，可申请提现。六大支付提供商全覆盖

**提现管理**：用户在 Dashboard 提交提现申请，系统立即扣减余额防止超额提现，管理员在后台审批——批准后手动转账，拒绝则自动退还余额

**管理后台**：Admin 面板新增 Commissions 和 Withdrawals 两个页面，支持按邮箱搜索、分页浏览所有佣金记录和提现请求，管理员可直接审批或拒绝提现

**三层功能开关**：系统默认关闭；设置 `AFFILIATE_ENABLED=true` 才会启用。未开启或设为 `false` 时，UI 隐藏相关标签页、API 返回禁用状态、Webhook 跳过佣金处理。

### 数据库变更

**Schema 扩展**：用户表新增 `referralCode`（推荐码）、`referredByCode`（推荐人码）、`commissionBalance`（佣金余额）三个字段，新建 `commission` 佣金表和 `withdrawal` 提现表，PG 和 SQLite 双方言 Drizzle 迁移同步到位

### 配置与环境变量

为避免在未配置提现和风控流程时产生佣金义务，必须先设置 `AFFILIATE_ENABLED=true`；其余选项可使用默认值：

- `AFFILIATE_COMMISSION_RATE` — 佣金比例，默认 20%
- `AFFILIATE_FIXED_COMMISSION_AMOUNT` — 固定佣金金额（覆盖百分比模式）
- `AFFILIATE_CURRENCY` — 结算币种，默认 USD
- `AFFILIATE_MIN_WITHDRAWAL` — 最低提现金额，默认 100
- `AFFILIATE_REFERRER_SIGNUP_BONUS` / `AFFILIATE_REFEREE_SIGNUP_BONUS` — 双向注册积分奖励，默认各 10
- `AFFILIATE_COOKIE_EXPIRY_DAYS` — 推荐链接 Cookie 有效天数，默认 30

### i18n 国际化

中英文完整覆盖，Dashboard 标签、佣金统计、佣金记录表、提现表单、管理后台页面和错误提示均使用 i18n key，无硬编码文本

### E2E 测试

33 个 E2E 测试用例覆盖完整的 affiliate 生命周期——推荐统计、链接展示、Claim 流程、Stripe/Dodo 支付佣金产生、提现申请、管理员佣金查看与提现审批。三个框架 × 两种数据库共 6 个组合全部通过

### 文档

- **用户指南**：`docs/user-guide/affiliate.md` — 配置指南、工作流程、API 端点、管理员操作、常见问题
- **实现文档**：`docs/implementation/affiliate-system.md` — 架构设计、数据库 Schema、核心模块、框架适配详解
