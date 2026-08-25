# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

个人用户在电脑端管理多个自己的抖音账号、好友关系维护任务和执行状态；管理员负责用户、账号、任务、风险、Worker、审计与权益运营。

## Product Purpose

Douyin Keeper 帮助用户在真实好友关系中配置每日一次的火花维护互动，并在登录失效、安全验证或任务失败时明确停止和通知。产品成功的标准是让用户能安全地配置、理解和维护关系，而不是批量营销。

## Positioning

核心机制是“账号 + 确定好友 + 每日一次 + 时间窗口”的关系维护任务模型；每个账号的登录态和好友数据隔离，任务执行遵循限流、风险暂停和幂等边界。

## Operating Context

PC 端承担完整配置和管理；用户需要注册、绑定抖音账号、同步好友、选择好友、配置消息与时间窗口、查看发送记录和风险提醒。管理员还需要查看运行状态、队列、Worker、Adapter、权益和审计。

## Capabilities and Constraints

- 支持多账号、好友同步、每日一次火花任务、文本消息、发送记录、失败原因、风险提醒和权益控制。
- 支持用户端与管理端共用一个 SPA，并使用统一的主题和组件库。
- 不做群发营销、验证码破解、安全验证绕过、设备指纹伪装、代理池或自动回复机器人。
- Landing 页的 CTA 只能引导注册/登录或进入产品，不虚构价格、客户、指标或支付能力。

## Brand Commitments

产品名为 Douyin Keeper / 抖音火花助手。用户明确要求 landing 页参考 `reference/tinyship-main`，并在现有主题系统上做更大胆、更有活力的表达。

## Evidence on Hand

- 产品事实与版本边界：`deploy/docs/01-product-scope.md`
- Landing 参考：`reference/tinyship-main/apps/nuxt-app/pages/index.vue`
- 共享主题变量：`packages/ui-web/src/styles/themes/`

## Product Principles

- 关系维护优先于营销扩张。
- 每个动作可理解、可追溯、可停止。
- 风险和登录状态必须显式反馈。
- PC 端配置完整，小屏端保持可用。

## Accessibility & Inclusion

Landing 页需要支持键盘访问、清晰的焦点状态、足够的文字对比度、减少动态效果偏好，以及移动端的单列阅读与 CTA。
