# Playwright/Chromium 无头模式更容易触发网站安全验证的原因

研究范围：只讨论 Playwright 驱动 Chromium 时，无头（headless）与有头（headed）模式的差异，以及这些差异为什么可能影响网站的安全验证。本文只采用 Playwright 官方文档、Chromium 官方文档/代码和 W3C WebDriver 标准；不包含任何账号、Cookie、二维码或密钥。

## 结论摘要

1. **“无头”不是简单地把有头浏览器窗口隐藏起来。** Playwright 当前文档写明：默认无头运行使用单独的 `chromium-headless-shell`；有头运行使用常规 Chromium，而 `channel: "chromium"` 可选择 Chromium 的新 headless 实现。旧 shell 与完整 Chrome 的代码路径和依赖不同，因此两者可能产生不同的可观察行为。
2. **无头环境可能直接暴露自动化/无头身份。** Chromium 的旧 headless 实现把默认产品名设为 `HeadlessChrome`；Chromium 当前 headless 相关测试也断言其 User-Agent 包含 `HeadlessChrome/`，并为 User-Agent Client Hints 生成 `HeadlessChrome` brand。网站可以从请求头或客户端提示读取这些字段。
3. **远程控制状态有标准化的浏览器暴露面。** W3C WebDriver 规定，浏览器处于远程控制时设置 webdriver-active flag，`navigator.webdriver` 返回 `true`。这是自动化可被页面识别的标准接口；它不是“无头专属”，所以切换到有头并不自动消除自动化识别。
4. **无头与有头在窗口/焦点/图形/系统依赖方面也可能不同。** Chromium 官方资料将旧 headless shell 描述为基于 `//content` 的轻量实现，缺少完整 Chrome 的一部分依赖；Chromium 自身代码还记录了 headless 下 `document.hasFocus()` 可能为 `false`。这类差异未必单独触发验证，但可作为网站风险评估中的额外信号（这是推断）。
5. **“无头更容易触发验证”不能从这些官方资料推导为一个普遍、必然的规则。** 官方资料没有公开某个具体网站的验证阈值、加权算法或“发现 headless 就拦截”的规则。更严谨的表述是：无头模式增加了若干可观察差异；若目标站点把这些差异与自动化行为、请求频率、IP/网络信誉等信号组合评估，则更可能进入挑战流程（明确标注为推断）。

## 可验证事实

### 1. Playwright 默认 headless 与 headed 可能使用不同的浏览器实现

- Playwright 的 BrowserType API 文档：`headless` 默认值为 `true`；`channel: "chromium"` 用于选择新 headless 模式。
- Playwright 的 Browsers 文档明确写明：Playwright 为有头操作提供常规 Chromium，为无头模式提供单独的 chromium headless shell；新 headless 可以通过 `channel: "chromium"` 选择。
- 同一文档还警告：Google Chrome 和 Microsoft Edge 已切换到更接近常规有头模式的新 headless 实现，这与 Playwright 默认使用的 chromium headless shell 不同，因此行为可能不同。

来源：

- [Playwright Browsers — Chromium headless shell / new headless mode](https://playwright.dev/docs/browsers)
- [Playwright BrowserType API — `headless` 与 `channel`](https://playwright.dev/docs/api/class-browsertype)
- [Playwright CLI — `--headed` 与默认 headless](https://playwright.dev/docs/test-cli)

### 2. Chromium 存在“旧 headless shell”和“新 headless”两条实现路径

- Chromium 官方代码仓库的 `chrome/browser/headless/README.md` 写明：新 Headless 实现在 `//chrome` 中实现并共享浏览器代码；旧 Headless 是单独的应用层，位于 `//headless`。
- Chrome 官方文档写明：从 Chrome 112 起，新 headless 基于与常规 Chrome 相同的代码库；旧 headless shell 是轻量的 `//content` 封装，依赖更少。官方同时明确指出，新 headless 更接近真实 Chrome、功能更多，旧 shell 更轻量。
- Chrome 132 起，Chrome 二进制不再提供 `--headless=old`；需要旧实现时应使用独立的 `chrome-headless-shell`，或迁移到新 headless。

来源：

- [Chromium source — Chromium’s new Headless mode](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/headless/README.md)
- [Chrome for Developers — Headless Chrome shell](https://developer.chrome.com/docs/automation-and-testing/headless-chrome-shell)
- [Chrome for Developers — Removing `--headless=old` from Chrome](https://developer.chrome.com/blog/removing-headless-old-from-chrome)

### 3. 旧 headless 及 Chromium headless 代码会把 `HeadlessChrome` 放入 UA/UA-CH

- Chromium 旧 headless 源码定义默认产品名 `kHeadlessProductName = "HeadlessChrome"`，并用它构建默认 User-Agent。
- Chromium 当前 `headless/lib/browser/headless_browser_impl.cc` 的测试断言：headless 的 User-Agent metadata 的 brand 列表应包含 `HeadlessChrome`。
- Chromium 当前 `chrome/browser/headless/headless_mode_browsertest.cc` 的测试断言：headless 请求的 `User-Agent` 应包含 `HeadlessChrome/`。
- 这些字段属于页面或服务器可能读取的浏览器身份信息；它们是否会在某个具体网站上触发挑战，需要该网站自己的规则或实际测试才能确认。

来源：

- [Chromium source — old headless default UA product](https://chromium.googlesource.com/chromium/src/+/main/headless/lib/browser/headless_browser_impl.cc)
- [Chromium source — headless User-Agent metadata test](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/headless/lib/browser/headless_browser_impl_unittest.cc)
- [Chromium source — new headless User-Agent browser test](https://chromium.googlesource.com/chromium/src/+/refs/tags/143.0.7495.0/chrome/browser/headless/headless_mode_browsertest.cc)

### 4. `navigator.webdriver` 是 W3C 标准定义的自动化暴露面

W3C WebDriver 规范规定：

- 当用户代理处于远程控制下，webdriver-active flag 设为 `true`。
- `NavigatorAutomationInformation.webdriver` 返回该 flag 的值。
- 该接口的目的包括让网页作者知道用户代理由 WebDriver 控制，从而选择不同的代码路径。

因此，`navigator.webdriver` 是“自动化控制”信号，而不是“是否显示窗口”信号。切换到 headed 只能改变部分渲染/浏览器外观条件，不能据此断言自动化状态消失。

来源：

- [W3C WebDriver Recommendation — webdriver-active flag and `navigator.webdriver`](https://www.w3.org/TR/webdriver1/)

### 5. 无头环境存在官方记录的焦点、图形和系统依赖差异

- Chrome 官方文档称旧 headless shell 是基于 `//content` 的轻量封装，不需要 X11/Wayland、D-Bus 等完整 Chrome 所需的部分依赖。
- Chromium 的 ChromeDriver 代码在判断元素是否获得焦点时注明：headless mode 下 `document.hasFocus()` 会返回 `false`，因此该路径使用了不同的判断方式。
- Chrome 官方资料还明确指出新 headless 比旧 headless 更重，但更接近真实 Chrome、可靠性和功能更好。

来源：

- [Chrome for Developers — old headless shell dependencies and new headless trade-off](https://developer.chrome.com/docs/automation-and-testing/headless-chrome-shell)
- [Chromium source — ChromeDriver element focus handling in headless mode](https://chromium.googlesource.com/chromium/src/+/main/chrome/test/chromedriver/element_commands.cc)
- [Chrome for Developers — Chrome tools and new Headless mode](https://developer.chrome.com/blog/tools-from-chrome-for-frictionless-testing)

## 为什么这会表现为“更容易触发验证”

以下部分是基于上述事实的**明确推断**，不是官方对某个网站风控算法的公开说明：

1. **身份信号更直接。** 如果使用的是旧 headless shell，`HeadlessChrome` 可能同时出现在 HTTP User-Agent 和 User-Agent Client Hints 中。一个网站无需猜测渲染环境，只要读取这些字段，就能把请求归入 headless/自动化风险类别。
2. **行为信号更容易与环境信号叠加。** 自动化脚本通常以固定节奏执行导航、点击和表单操作；如果这些行为与 `navigator.webdriver`、headless UA 或无头焦点差异同时出现，风险系统可以把它们组合成更高置信度的“非真实交互”判断。官方资料只证明这些观测面存在，不证明任何特定站点采用了该组合算法。
3. **默认实现选择可能放大差异。** Playwright 默认无头模式使用 headless shell，而 headed 使用常规 Chromium；即使两者都由同一个 Playwright API 驱动，底层实现不同也会带来额外差异。使用新 headless 可以减少“旧 shell 与完整 Chrome 不同”的一部分差异，但不能保证与 headed 完全相同，也不能消除标准的自动化暴露面。
4. **有头模式的“缓解”是条件性的。** headed 通常移除“无窗口/旧 headless shell/HeadlessChrome UA”等部分信号（具体 UA 仍取决于浏览器通道和版本），所以可能降低因 headless 特征导致的挑战；但它不是反验证保证，因为远程控制、脚本节奏、网络信誉和其他环境信息仍可能被评估。

## 不能从官方资料直接得出的结论

- 不能断言所有网站都会检测 `navigator.webdriver`，也不能断言检测到它就一定拦截。
- 不能断言所有 Playwright 版本、所有 Chromium channel、所有操作系统的 headless UA 都完全相同；Playwright 文档本身已区分 headless shell、新 headless 和 branded Chrome channel。
- 不能把“headless 验证失败”归因于单一因素。没有目标网站的官方风控文档、请求样本和对照实验，就无法确定是 UA、WebDriver 暴露、图形/焦点差异、网络信誉、频率，还是它们的组合。
- 不应把修改浏览器指纹或规避安全验证当作本研究的结论。本文仅解释可观察差异及证据边界，不提供绕过验证的方案。

## 对当前问题的可操作判断（不涉及业务代码改动）

若只做诊断，最小的对照维度应是：同一 Chromium 版本、同一网络出口、同一页面流程，分别记录 headed、Playwright 默认 headless shell、Chromium 新 headless 的响应状态和页面可见环境信息，并脱敏保存。应至少区分：

- `User-Agent` 与 UA Client Hints 中是否出现 `HeadlessChrome`；
- `navigator.webdriver` 的实际值；
- 页面焦点、窗口尺寸、图形能力等与运行模式有关的可观察值；
- 请求频率、并发、重试和网络出口等非浏览器变量。

这只是验证假设的实验设计（推断），不是对目标网站规则的既定判断。实验记录不得包含账号、Cookie、二维码、Authorization 头或任何密钥。

