未引入完整 Vue Vben Admin 5 monorepo。本目录是 **Vue 3 + Vite + Ant Design Vue** 骨架，位于 `spark/frontend/`，与 `spark/backend` 并列。布局对齐 Vben：

- `AuthPageLayout`：`/login` `/register` `/forgot-password`
- `BasicLayout`：左侧边栏 + 顶栏（用户/管理员菜单分组）
- `MarketingLayout`：官网 `/`，视觉按 `docs/02-M0-设计冻结/07-官网首页.md`

控制台不引用官网纸色皮肤。没有 mock 列表、演示账号或假折线；空库各页显示「暂无数据」。官网 Hero 纸条是纯装饰，不写好友名。`/douyin/:id` 扫码 Tab 显示 Worker SSE 推来的真二维码，短信 Tab 由用户自看短信后回填。后续若单独拉官方 `web-antd`，把 `src/views` 与 `src/api` 迁过去即可，不要带 Vben 示例仪表盘。
