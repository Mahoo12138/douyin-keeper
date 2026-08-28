# Node Sidecar 与账号 Profile 重构

## 目标

浏览器自动化运行时统一由 Node.js + Playwright 承载。Go 负责账号、会话密文、任务编排、并发锁和状态机；Node sidecar 只负责浏览器上下文和抖音页面操作。

## Profile 生命周期

每个绑定账号使用稳定目录：

```text
<LOGIN_PROFILE_DIR>/account-<account-public-uuid>/
```

目录由 worker 根据账号公共 UUID 生成，不使用昵称或用户输入。目录及临时会话导出文件分别使用 `0700` 和 `0600` 权限。数据库中的加密 `account_sessions` 仍是会话真相源；执行任务时，sidecar 复用该账号的持久化 Profile，仅在 Profile 没有有效登录 cookie 时注入临时解密出的 storage state。

绑定流程会保留账号 Profile，删除临时 session export。解绑、重置账号或按保留策略清理 Profile 时，才删除对应目录。所有同一账号的浏览器操作仍由 Go worker 的账号锁串行化。

## 运行方式

本地测试默认使用有头浏览器，便于完成扫码和官方安全验证：

```bash
export PLAYWRIGHT_HEADLESS=0
export PLAYWRIGHT_SIDECAR_COMMAND=node
export PLAYWRIGHT_SIDECAR_SCRIPT=sidecars/playwright-node/sidecar.mjs
go -C backend run ./cmd/worker-interactive
```

部署环境可显式设置 `PLAYWRIGHT_HEADLESS=1`。sidecar 支持通过 `PLAYWRIGHT_EXECUTABLE_PATH` 指定本机 Chromium/Chrome/Edge，用于本地调试；生产镜像由 worker Dockerfile 安装与 Node Playwright 版本匹配的 Chromium。

## 协议边界

sidecar 使用 v1 NDJSON 协议，支持：

- 抖音 Web QR / SMS 登录及登录态导出
- 会话校验
- 好友分页滚动同步
- 会话列表、归档
- 文本、贴纸消息发送

页面结构变化、登录挑战、消息发送回执缺失都会 fail-closed 返回明确错误，不伪造成功结果。Go 层负责把这些错误映射为任务失败、重试、风险或人工处理状态。

## 验证

```bash
npm --prefix sidecars/playwright-node test
go -C backend test ./...
pnpm test
```
