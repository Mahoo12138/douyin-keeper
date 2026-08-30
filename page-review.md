# 小程序 / PC 页面逐页复核

复核日期：2026-08-30  
复核方式：微信开发者工具模拟器（359×777，已登录态）+ PC 本地页面（1280×720，已登录态）截图和 DOM 对照；另保留未登录态截图验证鉴权跳转。

## 页面映射与结论

| 小程序页面 | PC 页面 | 小程序当前状态 | 复核结论 |
| --- | --- | --- | --- |
| 首页 `pages/index/index` | `/dashboard` | 未登录时按设计跳转登录；登录后使用真实 `/me`、`/accounts`、`/tasks`、`/send-intents`、`/notifications` | 已接入真实接口；首页 4 个概览指标与 PC 的“有效账号 / 今日发送 / 启用任务 / 未读通知”口径一致，并显示最近风险通知 |
| 会话 `pages/spark/index` | `/conversations` | 未登录空态；登录后加载统一会话接口 | 已覆盖搜索、账号切换、火花开关、任务编辑、归档、平台归档和同步任务；移动端采用卡片/横向筛选布局 |
| 任务 `pages/tasks/index` | `/tasks` | 未登录空态；登录后真实加载任务、账号、会话和模板 | 已覆盖列表、启停、创建、编辑、立即执行、删除、模板管理和执行记录 |
| 账号 `pages/accounts/index` | `/accounts` | 未登录空态；登录后真实账号列表和绑定流程 | 已覆盖二维码/短信绑定、轮询、会话检查、同步、暂停/恢复、解除绑定；数据字段与 PC 账号状态一致 |
| 发送记录 `pages/history/index` | `/history` | 未登录空态；登录后按本地日范围加载 `/send-intents` | 已覆盖日期切换、状态筛选、成功/关注统计和失败原因；移动端使用记录卡片 |
| 我的 `pages/login/index` | `/settings`、`/notifications`、`/entitlement` | 未登录显示登录/注册；登录后进入我的及其子页面 | 已覆盖密码/微信登录、通知偏好、站内通知、权益兑换、兑换记录、帮助与隐私；未登录时隐藏原生 tabBar 与登录页冲突 |

## 证据截图

PC：`design-qa-evidence/pages/pc-{dashboard,conversations,tasks,accounts,history,settings,notifications,entitlement}.png`  
小程序已登录态：`design-qa-evidence/pages/mini-{home,conversations,tasks,accounts,history,me,entitlement,grants,notifications,settings}-authenticated*.jpg`  
小程序未登录态：`design-qa-evidence/pages/mini-{home,conversations,tasks,accounts,history,login}-guest.jpg`

## 复核发现

1. 会话页是当前视觉对照重点：标题、副标题、账号卡、16/10/0 统计、搜索框、四个筛选态、圆形头像、火花/任务状态和开关均已落地。所有会话操作图标图片使用圆形容器，避免出现方形操作图。
2. 小程序与 PC 的信息密度不同是有意的响应式适配：PC 使用表格和批量勾选，小程序使用纵向卡片、展开详情和逐条操作；接口和业务状态保持一致。首页风险提示已改为复用 PC 同源的最近通知数据。
3. 已使用仓库 seed 提供的开发账号在小程序内完成密码登录；网络记录确认 `/me`、账号、任务、会话、发送记录、通知和权益接口均返回 200，截图中的隐隐控、16 条会话、1 项任务、13 条今日记录和 standard 权益均来自真实后端。
4. 当前 PC 会话页请求 `include_archived=false`，因此 PC 的“已归档”统计为 0；小程序为了支持设计稿中的“已归档”筛选请求全部会话，当前真实数据为 61 条归档会话。这是客户端查询范围差异，未擅自改动 PC 端行为，已记录供产品决定是否统一。
5. 在连续快速切页时开发者工具曾短暂记录 `routeDone with a webviewId ... is not found`；按刷新后单次导航复核，console 已为空，确认是自动化切页时序噪声，不是页面代码异常。
6. 最终单页稳定复核中，`wechatide get_simulator_console --command "grep -i error"` 返回空结果；未发现运行时错误。

## 已执行验证

- `pnpm --filter @douyin-keeper/mini typecheck`
- `pnpm --filter @douyin-keeper/mini test`
- `pnpm --filter @douyin-keeper/mini build:weapp`
- `pnpm --filter @douyin-keeper/web build`
- `git diff --check`
