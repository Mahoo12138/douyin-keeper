# 会话页面 Design QA

## 对照目标

- source visual truth path: `/Users/mahoo/Projects/douyin-keeper/design-qa-evidence/conversation-reference.png`
- implementation screenshot path: `/Users/mahoo/Projects/douyin-keeper/design-qa-evidence/conversation-implementation-final.jpg`
- final combined comparison: `/Users/mahoo/Projects/douyin-keeper/design-qa-evidence/conversation-comparison-final.png`
- source pixels: `941 × 1672`
- implementation pixels: `359 × 777`
- implementation CSS viewport: 微信开发者工具模拟器 `359 × 777`，deviceScaleFactor `1`
- density normalization: 参考图按宽度缩放至 `359 × 638`，与 `359 × 777` 模拟器截图并排；参考图为较短屏幕比例，垂直方向不拉伸，剩余高度居中留白，避免把设备比例差异误判为页面偏差。
- state: 会话页、当前账号已绑定、全部筛选、5 条按真实接口结构临时注入的 QA 数据、无展开项；临时注入逻辑仅用于截图和交互验收，最终正常构建不包含演示数据入口。

## Full-view comparison evidence

最终并排证据显示，页面的信息架构、主视觉顺序和重点区域已经与参考图一致：大标题与副标题、账号概览和同步入口、三项指标、搜索、四项胶囊筛选、头像/火花/任务/时间/开关组成的会话行，以及原生底部标签栏均处于对应位置。微信模拟器采用更高的屏幕比例，因此列表下方比参考图多出可用空白；这是设备视口差异，不是内容溢出或持久导航遮挡。

## Focused region comparison evidence

账号卡、统计卡、搜索筛选区和首三条会话行在最终并排图中均可清晰阅读，无需额外裁切。重点检查结果：

- Fonts and typography: 系统中文字体、标题粗细、辅助文字层级和标签字重与参考图接近；没有异常换行或裁切。
- Spacing and layout rhythm: 账号卡与统计卡高度在第一轮后收紧；圆角、柔和阴影、卡片间距和紧凑列表节奏已对齐。
- Colors and visual tokens: 使用参考图的薄荷绿、青绿、橙色火花、浅灰背景与白色卡片；开关和选中筛选具有一致的绿色语义。
- Image quality and asset fidelity: 真实接口头像优先；缺省状态使用 256px 本地插画头像，所有头像和操作图像均圆形裁切；同步、搜索、火焰为独立高分辨率 PNG，不使用文字或 CSS 图形代替。
- Copy and content: 标题、副标题、账号状态、同步、统计标签、搜索提示、筛选项和任务状态与设计稿一致；数值和日期来自 QA 状态，因此不强行复制设计稿示例值。

## Findings

- 无可执行的 P0/P1/P2 问题。
- P3：参考图为约 `375 × 667` 的较短设备比例，微信模拟器为 `359 × 777`，导致底部标签栏上方留白更多。页面内容在两种比例下均未溢出或被遮挡，保留响应式行为。
- P3：参考图展示 16 条会话统计，QA 状态仅渲染 5 条可交互数据。统计差异属于数据状态，不影响组件比例或布局判断。

## Comparison history

### Iteration 1 — blocked

- evidence: `/Users/mahoo/Projects/douyin-keeper/design-qa-evidence/conversation-comparison-1.png`
- P1: 缺省头像仍依赖不可达的远程资源，在模拟器里显示为空色块。
- P2: 账号卡、统计卡和会话行明显偏高，主列表起点比参考图低。
- P2: 搜索和同步控件缺少与参考图一致的独立图标，火焰指标图标语义不准确。

Fixes made:

- 新增三张独立的 256px 会话头像，并让接口头像优先、缺省头像本地回退。
- 收紧账号卡内边距、统计卡高度与行高，使主列表上移并恢复参考图的密度。
- 新增独立同步、搜索和火焰 PNG 图标，统一使用圆形容器或圆形裁切。

### Iteration 2 — passed

- post-fix evidence: `/Users/mahoo/Projects/douyin-keeper/design-qa-evidence/conversation-comparison-final.png`
- 前述 P1/P2 已修复；剩余差异均为设备比例或数据状态差异。
- 交互验证：搜索从 5 条过滤到 1 条；清空后恢复 5 条；“已开火花”筛选得到 1 条；点击会话行能展开管理区；火花开关 change 事件能从 `false` 更新到 `true`；模拟器 console 无 error。

## Implementation checklist

- [x] 页面结构与参考图一致
- [x] 搜索、筛选、账号切换与同步入口可交互
- [x] 火花开关、任务编辑和归档能力保留
- [x] 头像和操作图片统一圆形处理
- [x] TypeScript、单元测试、微信小程序构建通过
- [x] 模拟器交互和 console 检查通过

final result: passed
