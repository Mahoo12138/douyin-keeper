# 抖音接入设计

## 1. Adapter 能力接口

业务层不直接依赖 Cookie、DOM、Webpack。

定义逻辑能力：

### SessionAdapter

- `StartQRLogin()`
- `StartSMSLogin()`
- `VerifySMS()`
- `ValidateSession()`

### FriendAdapter

- `ListFriends()`
- `ResolveIdentity()`

### ConversationAdapter

- `ListConversations()`
- `ResolveConversation(friend)`

### MessageAdapter

- `SendText()`
- `SendSticker()`：接收 `sticker_id`，仅在已有会话和 `message.send.sticker.existing`
  capability 可用时发送；任务不会上传或持久化图片文件。
- `SendFirstText()`

Adapter 通过 Capability 声明支持范围。

## 2. QR 登录

流程：

1. API 创建 Binding Job；
2. interactive worker 获取账号级临时锁；
3. Playwright 打开抖音登录页面；
4. 解析并输出二维码；
5. SSE 发送 `qr_ready`；
6. 用户扫码；
7. Playwright 检查明确的登录成功信号；
8. 导出 storage state；
9. Go 验证 Session；
10. 加密存储；
11. 删除临时明文；
12. 创建/更新 DouyinAccount；
13. 发起首次好友同步。

不能仅凭“发现某个 Cookie 名”就永久判定 Session 有效，最好再执行一个低成本已登录页面/API 验证。

## 3. SMS 登录

V1.1：

- API 只接收用户输入的手机号用于启动流程；后端不代收短信；
- 同一次 SMS Binding 使用独立临时 Profile；
- `start` 与 `verify` 复用 Profile；
- Profile 有 TTL；
- `sms_code_required` 事件只通知过期时间，不携带手机号或验证码；
- 验证码通过 `POST /jobs/{jobId}/sms-verify` 进入 Redis 短时键，worker 使用一次后立即删除；
- 完成/取消/超时自动删除；
- 出现安全验证则进入 `challenge_required`，停止自动流程。

## 4. 多账号隔离

每个账号：

- 独立 encrypted session；
- 独立 friend namespace；
- 独立 conversation；
- 独立 SparkTask；
- 独立 risk state；
- 独立 account lock。

执行时不要把多个账号加载到同一个 Persistent Browser Profile。

普通操作优先使用：

`browser.new_context(storage_state=...)`

登录这种必须跨请求保持页面状态的流程，才使用临时 Persistent Context。

## 5. 好友身份

返回好友时至少尽力解析：

- `platform_user_id`
- `display_name`
- `nickname`
- `short_id`
- `avatar`
- `streak_days`
- `conversation_id`

数据库主身份：

`(account_id, platform_user_id)`

发送必须从 `friend_id -> platform_user_id/conversation_id` 路由。

禁止：

`friend_id -> nickname -> 页面搜索昵称 -> 直接发送`

昵称搜索只能作为人工辅助或身份恢复手段，并且遇到多个候选必须停止。

## 6. Browser Sender

Browser Sender 是稳定基线能力。

发送成功不能只依赖 sleep，至少需要一个明确确认：

- 输入框内容被提交且出现新消息节点；或
- 页面返回可识别的发送成功状态；或
- 能读取到新的 platform message id。

失败类型必须结构化返回：

- `expired`
- `challenge_required`
- `rate_limited`
- `conversation_not_found`
- `friend_ambiguous`
- `selector_changed`
- `navigation_failed`
- `timeout`

## 7. Protocol Sender

Protocol 作为可选、实验性 Adapter。

原则：

- Protocol 不控制账号 Session 生命周期；
- Protocol 自身有版本号；
- Protocol 有健康检查与 Circuit Breaker；
- 出现 SDK 不兼容时全局关闭该 Adapter，而不是让每个账号反复失败；
- 支持 fallback 的错误才回落浏览器。

如果继续复用远端前端 Bundle：

- Bundle URL 不直接硬编码为“永远有效”；
- 使用 manifest；
- 保存 SHA-256；
- 下载后校验；
- 只运行已验证版本；
- Sidecar 无 DB/Redis/主 Session Key 权限。

在真实 Protocol SDK 接入前，当前本地切片先冻结并加固 NDJSON envelope：请求 deadline
范围、输入对象和未知字段由 Sidecar 拒绝，失败响应保留 Adapter 的 outcome 证据。
`send.protocol` 已接入 `worker-light` 的发送 preflight 和 `message.send_first` 路由；真实
平台发送仍需完成 SDK/selector 联调后才能启用，未部署时保持 fail-closed。

更理想的长期方向是把必要协议抽象成稳定的内部 SDK，而不是长期依赖前端 webpack chunk 结构。

## 8. Capability

示例：

```json
{
  "login.sms": "available",
  "session.validate": "available",
  "friends.sync": "available",
  "message.send.text.existing": "available",
  "message.send.sticker.existing": "unavailable",
  "message.send.text.first": "degraded"
}
```

C 端页面展示能力状态，避免用户只看到一个模糊的“账号正常/异常”。
