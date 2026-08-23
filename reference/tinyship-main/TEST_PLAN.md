# TinyShip 测试计划

## 📋 测试概述
本文档提供了 TinyShip 应用的完整测试流程，分为两个主要部分：
1. **手动界面测试** - 在浏览器中测试用户界面和用户流程
2. **API 测试** - 使用工具测试后端接口和权限控制

## 🔧 测试准备

### 测试环境
- **应用地址**: `http://localhost:7001` (或你的测试环境地址)
- **API 测试工具**: Bruno (推荐) 或 Postman
- **浏览器**: Chrome/Firefox (开启开发者工具)

### ⚙️ 关键配置设置

在开始测试前，请了解以下配置选项，它们会影响用户认证流程：

#### 邮件验证配置
**位置**: `config.ts` → `auth.requireEmailVerification`

- **`false`** (默认): 注册后直接进入应用，无需邮件验证
- **`true`**: 注册后需要点击邮件中的验证链接才能完成注册

**如何修改**:
1. 编辑项目根目录的 `config.ts` 文件
2. 找到 `auth: { requireEmailVerification: false }` 
3. 修改为 `true` 或 `false`
4. 重启开发服务器 (`npm run dev`)

#### 验证码配置  
**位置**: `config.ts` → `captcha.enabled`

- **`false`** (默认): 禁用验证码
- **`true`**: 启用 Cloudflare Turnstile 验证码

### 测试账户准备
在开始测试前，请准备以下测试账户：

1. **普通用户账户**
   - 邮箱: `test@example.com`
   - 密码: `password123`
   - 状态: 已验证邮箱

2. **管理员账户**
   - 邮箱: `admin@example.com`
   - 密码: `admin123`
   - 角色: ADMIN

3. **未验证用户账户**
   - 邮箱: `unverified@example.com`
   - 密码: `password123`
   - 状态: 未验证邮箱

---

# 第一部分：手动界面测试

## 公开功能测试 (无需登录)

### 1.1 页面访问测试

#### 测试步骤：
1. **打开浏览器**，清除所有 cookies 和缓存
2. **访问以下页面**，确认都能正常访问：

| 页面 | URL | 预期结果 |
|------|-----|----------|
| 首页 | `http://localhost:7001/zh-CN/` | ✅ 正常显示首页内容 |
| 定价页面 | `http://localhost:7001/zh-CN/pricing` | ✅ 显示定价信息 |
| 登录页面 | `http://localhost:7001/zh-CN/signin` | ✅ 显示登录表单 |
| 注册页面 | `http://localhost:7001/zh-CN/signup` | ✅ 显示注册表单 |
| 忘记密码 | `http://localhost:7001/zh-CN/forgot-password` | ✅ 显示密码重置表单 |
| 重置密码 | `http://localhost:7001/zh-CN/reset-password` | ✅ 显示密码重置表单 |
| 手机验证 | `http://localhost:7001/zh-CN/cellphone` | ✅ 显示手机验证页面 |
| 微信登录 | `http://localhost:7001/zh-CN/wechat` | ✅ 显示微信登录页面 |

3. **尝试访问受保护页面**，确认会被重定向：

| 页面 | URL | 预期结果 |
|------|-----|----------|
| 用户仪表板 | `http://localhost:7001/zh-CN/dashboard` | ❌ 重定向到 `/zh-CN/signin` |
| AI 功能 | `http://localhost:7001/zh-CN/ai` | ❌ 重定向到 `/zh-CN/signin` |
| 管理员面板 | `http://localhost:7001/zh-CN/admin` | ❌ 返回 403 或重定向 |
## 📱 1. 用户认证流程测试

> **⚠️ 重要配置说明**：用户认证测试需要验证两种配置场景，请在测试前确认 `config.ts` 中的 `auth.requireEmailVerification` 设置。

### 1.1 用户注册流程

#### 1.1.1 邮件验证已启用 (`requireEmailVerification: true`)

**配置要求**：
- 修改 `config.ts`：`auth.requireEmailVerification: true`
- 重启开发服务器

**测试步骤**：
1. 访问 `http://localhost:7001/zh-CN/signup`
2. 填写注册信息（邮箱、密码、姓名）
3. 完成验证码验证
4. 提交注册
5. 检查开发环境控制台验证链接（或检查邮件）
6. 点击验证链接完成邮箱验证

**预期结果**：
- ✅ 注册成功，显示验证邮件发送提示界面
- ✅ 开发环境在控制台显示验证链接
- ✅ 点击验证链接后邮箱验证成功
- ✅ 验证完成后可以正常登录

#### 1.1.2 邮件验证已禁用 (`requireEmailVerification: false`) - 默认配置

**配置要求**：
- 确认 `config.ts`：`auth.requireEmailVerification: false`
- 重启开发服务器

**测试步骤**：
1. 访问 `http://localhost:7001/zh-CN/signup`
2. 填写注册信息（邮箱、密码、姓名）
3. 完成验证码验证
4. 提交注册

**预期结果**：
- ✅ 注册成功，直接重定向到仪表板页面
- ✅ 不显示邮件验证提示界面
- ✅ 用户可以立即使用所有功能
- ✅ 无需邮件验证即可完成注册流程

### 1.2 用户登录流程

#### 1.2.1 邮件验证已启用时的登录测试

**前置条件**：使用已验证邮箱的用户账号

**测试步骤**：
1. 访问 `http://localhost:7001/zh-CN/signin`
2. 输入已注册且已验证的邮箱和密码
3. 完成验证码验证
4. 点击登录

**预期结果**：
- ✅ 登录成功，重定向到仪表板
- ✅ 显示用户信息和导航菜单

#### 1.2.2 邮件验证已禁用时的登录测试

**前置条件**：使用任何已注册的用户账号（无需验证）

**测试步骤**：
1. 访问 `http://localhost:7001/zh-CN/signin`
2. 输入已注册的邮箱和密码（无论是否验证过）
3. 完成验证码验证
4. 点击登录

**预期结果**：
- ✅ 登录成功，重定向到仪表板
- ✅ 显示用户信息和导航菜单
- ✅ 即使邮箱未验证也可以正常登录

### 1.2.3 配置切换测试

**测试目标**：验证 `requireEmailVerification` 配置的动态切换

**测试步骤**：
1. **步骤 1**：设置 `config.ts` 中 `auth.requireEmailVerification: false`
2. 重启开发服务器
3. 注册一个新用户，验证直接跳转到仪表板
4. **步骤 2**：修改 `config.ts` 中 `auth.requireEmailVerification: true`
5. 重启开发服务器
6. 注册另一个新用户，验证显示邮件验证界面
7. **步骤 3**：切换回 `auth.requireEmailVerification: false`
8. 重启开发服务器
9. 使用之前的用户登录，验证无论验证状态如何都能登录

**预期结果**：
- ✅ 配置更改后行为立即生效
- ✅ 不同配置下的注册流程符合预期
- ✅ 配置更改不影响现有用户的登录能力

### 1.3 忘记密码流程
**测试步骤**：
1. 访问 `http://localhost:7001/zh-CN/forgot-password`
2. 输入注册邮箱
3. 完成验证码验证
4. 提交请求
5. 检查开发环境控制台重置链接（或检查邮件）
6. 访问重置链接，设置新密码

**预期结果**：
- ✅ 重置邮件发送成功
- ✅ 开发环境在控制台显示重置链接
- ✅ 密码重置成功，可用新密码登录

### 1.4 手机号验证登录
**测试步骤**：
1. 访问 `http://localhost:7001/zh-CN/cellphone`
2. 输入手机号码
3. 点击发送验证码
4. 检查开发环境控制台 OTP 代码
5. 输入验证码完成登录

**预期结果**：
- ✅ 验证码发送成功
- ✅ 开发环境在控制台显示 OTP 代码
- ✅ 验证码验证成功，完成登录

### 1.5 社交登录
**测试步骤**：
1. 在登录页面点击 GitHub/Google 登录按钮
2. 完成 OAuth 授权流程

**预期结果**：
- ✅ 重定向到 OAuth 授权页面
- ✅ 授权成功后返回应用并登录

### 1.6 微信登录
1. 访问 `http://localhost:7001/zh-CN/wechat`
2. 扫码完成登录

**预期结果**：
- ✅ 授权成功后返回应用并登录

## 👤 2. 用户账户管理测试

> **📍 测试地址**: `http://localhost:7001/zh-CN/dashboard`
> 
> **前置条件**: 使用已登录的测试账户

### 2.1 用户信息更新

**测试步骤**：
1. 登录测试账户
2. 访问 `http://localhost:7001/zh-CN/dashboard`
3. 在"个人资料"选项卡中点击"编辑"按钮
4. 修改用户姓名 (例如：从 "测试用户" 改为 "新名称")
5. 点击"保存"按钮
6. 验证成功提示信息
7. 刷新页面验证数据持久化

**预期结果**：
- ✅ 编辑按钮正常显示
- ✅ 表单正确填充当前用户信息
- ✅ 邮箱字段显示为只读状态
- ✅ 保存成功后显示成功提示
- ✅ 页面数据立即更新
- ✅ 刷新页面后新数据正确显示

**边界测试**：
- [ ] 提交空白姓名（应该允许）
- [ ] 提交超长姓名（测试输入限制）
- [ ] 取消编辑操作（数据应还原）

### 2.2 修改密码功能

**测试步骤**：
1. 在仪表板中切换到"账户"选项卡
2. 点击"修改密码"按钮
3. 在弹出的对话框中填写：
   - 当前密码：`password123`
   - 新密码：`newpassword123`
   - 确认新密码：`newpassword123`
4. 点击"修改密码"按钮
5. 验证成功提示
6. 使用新密码重新登录验证

**预期结果**：
- ✅ 修改密码对话框正常弹出
- ✅ 表单验证正确工作
- ✅ 密码修改成功提示
- ✅ 对话框自动关闭
- ✅ 新密码可以正常登录

**错误测试**：
- [ ] 当前密码错误（应显示错误提示）
- [ ] 新密码确认不匹配（应显示验证错误）
- [ ] 密码过于简单（应显示强度要求）
- [ ] 新密码与当前密码相同（应允许但提示）

### 2.3 删除账户功能

> **⚠️ 警告**: 这是破坏性操作，请使用专门的测试账户

**测试步骤**：
1. 创建一个专用测试账户（例如：`deletetest@example.com`）
2. 登录该测试账户
3. 访问仪表板"账户"选项卡
4. 点击"删除账户"按钮
5. 阅读警告信息和后果说明
6. 点击确认删除
7. 验证重定向到首页
8. 尝试使用已删除账户登录

**预期结果**：
- ✅ 删除按钮以红色危险样式显示
- ✅ 确认对话框显示明确的警告信息
- ✅ 列出删除后果（数据、订阅、访问权限）
- ✅ 删除成功后重定向到首页
- ✅ 显示删除成功的提示信息
- ✅ 已删除账户无法再次登录

**边界测试**：
- [ ] 取消删除操作（应保持账户正常）
- [ ] 删除有活跃订阅的账户（应处理订阅取消）
- [ ] 删除管理员账户（应有额外确认或限制）

### 2.4 仪表板导航测试

**测试步骤**：
1. 访问仪表板页面
2. 依次点击各个选项卡：
   - 个人资料
   - 订阅
   - 订单
   - 账户
3. 验证每个选项卡的内容正确加载
4. 检查响应式设计在不同屏幕尺寸下的表现

**预期结果**：
- ✅ 所有选项卡正常显示
- ✅ 选项卡切换流畅无延迟
- ✅ 当前选项卡正确高亮显示
- ✅ 每个选项卡内容完整加载
- ✅ 移动端导航正常工作

### 2.5 关联账户管理

**测试步骤**：
1. 访问"账户"选项卡
2. 查看关联账户卡片
3. 如果有社交账户关联，测试解除关联功能
4. 测试添加新的社交账户关联

**预期结果**：
- ✅ 正确显示已关联的社交账户
- ✅ 解除关联功能正常工作
- ✅ 添加关联功能正常工作
- ✅ 关联状态实时更新

## 💳 3. 支付和订阅流程测试

#### 3.1 Stripe 支付测试

**📋 测试计划清单**：
- [ ] Monthly Plan (monthly) - Stripe
- [ ] Monthly Pro Plan (monthly-pro) - Stripe  
- [ ] Lifetime Plan (lifetime) - Stripe

**测试步骤** (每个计划重复执行)：
1. 登录测试用户账号
2. 访问定价页面，选择对应计划
3. 选择 Stripe 支付方式
4. 填写测试信用卡信息：`4242 4242 4242 4242`
5. 完成支付流程
6. 验证支付成功页面
7. 检查仪表板订阅状态
8. 尝试访问 AI 功能 (`/zh-CN/premium-features`) 验证权限
9. 测试订阅管理功能
10. **清理数据**：删除订单和订阅记录

**预期结果**：
- ✅ Stripe 支付页面正常显示
- ✅ 支付成功，重定向到成功页面
- ✅ 仪表板显示正确的订阅状态
- ✅ 可以正常访问付费功能
- ✅ 订阅管理功能正常

**测试步骤继续**
1. 切换支付计划，访问用户portal
2. 切换为 pro 计划
3  检查仪表板订阅状态

**测试步骤继续**：
4. 切换支付计划，访问用户门户
5. 取消订阅（但不立即结束）
6. 检查仪表板订阅状态
7. **验证取消订阅状态显示**

**验证取消订阅状态**：
- ✅ 订阅状态应显示为"期末取消"（中文）或"Canceling at Period End"（英文）
- ✅ 应显示订阅结束日期，而不是"到期时间"
- ✅ 应显示提示信息："您的订阅将不会续订，并将在以下时间结束: [日期]"
- ✅ 用户仍可访问付费功能直到订阅期结束
- ✅ 数据库中 `cancelAtPeriodEnd` 字段应为 `true`

#### 3.1.3 已订阅用户访问定价页面 ✅
**测试步骤**：
1. 登录已订阅用户账户
2. 访问 `http://localhost:7001/zh-CN/pricing`

**预期结果**：
- ✅ **应该自动重定向到仪表板** (`/zh-CN/dashboard`)
- ✅ 不应该显示定价页面内容

#### 3.2 微信支付测试

**📋 测试计划清单**：
- [ ] Monthly Plan WeChat - 微信

**测试步骤** (每个计划重复执行)：
1. 登录测试用户账号
2. 访问定价页面，选择对应微信计划
3. 选择微信支付方式
4. 获取支付二维码或链接
5. 使用微信测试账号完成支付
6. 验证支付成功页面
7. 检查仪表板订阅状态
8. 尝试访问 AI 功能验证权限
9. 测试订阅管理功能
10. **清理数据**：删除订单和订阅记录

**预期结果**：
- ✅ 微信支付二维码正常生成
- ✅ 支付成功，订阅状态更新
- ✅ 仪表板显示正确的订阅信息
- ✅ 可以正常访问付费功能
- ✅ 订阅管理功能正常

#### 3.3 Creem 支付测试

**📋 测试计划清单**：
- [ ] Monthly Plan Creem (monthlyCreem) - Creem

**测试步骤** (每个计划重复执行)：
1. 登录测试用户账号
2. 访问定价页面，选择对应 Creem 计划
3. 选择 Creem 支付方式
4. 完成 Creem 支付流程
5. 验证支付成功页面
6. 检查仪表板订阅状态
7. 尝试访问 AI 功能验证权限
8. 测试订阅管理功能
9. **清理数据**：删除订单和订阅记录

**预期结果**：
- ✅ Creem 支付页面正常显示
- ✅ 支付成功，订阅状态更新
- ✅ 仪表板显示正确的订阅信息
- ✅ 可以正常访问付费功能
- ✅ 订阅管理功能正常

### 3.4 付费用户权限验证

**测试页面访问权限**：

| 用户状态 | 访问页面 | 预期结果 |
|----------|----------|----------|
| 未订阅 | `/zh-CN/ai` | ❌ 403 或重定向到定价页 |
| 未订阅 | `/zh-CN/premium-features` | ❌ 403 或重定向到定价页 |
| 已订阅 | `/zh-CN/ai` | ✅ 正常访问 |
| 已订阅 | `/zh-CN/premium-features` | ✅ 正常访问 |
| **取消订阅(期末)** | `/zh-CN/ai` | ✅ **仍可正常访问** |
| **取消订阅(期末)** | `/zh-CN/premium-features` | ✅ **仍可正常访问** |
| 订阅过期 | `/zh-CN/ai` | ❌ 403 或重定向到定价页 |
| Pricing | `/zh-CN/pricing` | 重定向到 dashboard |


### 3.5 数据清理步骤

> **⚠️ 重要**：每个支付测试完成后必须执行数据清理，确保下次测试的准确性。


## 🎯 4. AI 功能测试

### 4.1 AI 聊天功能
**测试步骤**：
1. 登录后访问 `http://localhost:7001/zh-CN/ai`
2. 输入测试问题
3. 发送消息
4. 查看 AI 回复

**预期结果**：
- ✅ AI 页面正常显示
- ✅ 聊天功能正常工作
- ✅ AI 回复及时且准确

## 🛡️ 5. 管理员功能测试

### 5.1 管理员登录
**测试步骤**：
1. 使用管理员账户登录
2. 访问 `http://localhost:7001/zh-CN/admin`

**预期结果**：
- ✅ 管理员可以访问管理面板

### 5.2 用户管理
**测试步骤**：
1. 访问 `http://localhost:7001/zh-CN/admin/users`
2. 查看用户列表
3. 测试用户搜索、排序功能
4. 测试用户编辑、封禁功能

**预期结果**：
- ✅ 用户列表正常显示
- ✅ 搜索和排序功能正常
- ✅ 用户管理操作正常

### 5.3 订单和订阅管理
**测试步骤**：
1. 访问 `http://localhost:7001/zh-CN/admin/orders`
2. 访问 `http://localhost:7001/zh-CN/admin/subscriptions`
3. 查看数据列表和统计信息

**预期结果**：
- ✅ 订单和订阅数据正常显示
- ✅ 管理功能正常工作

## 🔒 6. 权限和安全测试

### 6.1 页面访问权限
**测试步骤**：
1. 未登录状态访问受保护页面
2. 普通用户访问管理员页面
3. 已登录用户访问认证页面
4. 已订阅用户访问定价页面

**预期结果**：

| 用户状态 | 访问页面 | 预期结果 |
|----------|----------|----------|
| 未登录 | `/dashboard` | ❌ 重定向到登录页 |
| 未登录 | `/ai` | ❌ 重定向到登录页 |
| 未登录 | `/admin` | ❌ 重定向到登录页 |
| 未登录 | `/pricing` | ✅ 正常显示定价页面 |
| 未订阅用户 | `/pricing` | ✅ 正常显示定价页面 |
| 已订阅用户 | `/pricing` | ✅ **重定向到仪表板** |
| 普通用户 | `/admin` | ❌ 403 Forbidden |
| 已登录 | `/signin` | ✅ 重定向到仪表板 |
| 已登录 | `/signup` | ✅ 重定向到仪表板 |

---

# 第二部分：API 测试

## 🔧 API 测试准备

### 测试工具配置
推荐使用 Bruno 或 Postman，配置以下环境变量：
- `BASE_URL`: `http://localhost:7001`
- `CAPTCHA_TOKEN`: `XXXX.DUMMY.TOKEN.XXXX`

### Cookie 管理
- 登录后保存认证 cookie 用于后续测试
- 测试时注意使用正确的用户 cookie

## 🔓 1. 公开 API 端点测试

### 1.1 用户认证相关 API

#### 1.1.1 用户注册
**请求**: `🔓 用户邮件注册 (公开)`
```bash
POST http://localhost:7001/api/auth/sign-up/email
Headers: x-captcha-response: XXXX.DUMMY.TOKEN.XXXX
Body: {
  "email": "newuser@test.com",
  "password": "password123",
  "name": "Test User"
}
```
**预期结果**: ✅ 200 OK，返回用户创建成功信息

#### 1.1.2 用户登录
**请求**: `🔓 用户登录 (公开)`
```bash
POST http://localhost:7001/api/auth/sign-in/email
Headers: x-captcha-response: XXXX.DUMMY.TOKEN.XXXX
Body: {
  "email": "test@example.com",
  "password": "password123",
  "callbackURL": "/zh-CN",
  "rememberMe": true
}
```
**预期结果**: ✅ 200 OK，设置认证 cookie

#### 1.1.3 OAuth2 登录
**请求**: `🔓 OAuth2 登录 (公开)`
```bash
POST http://localhost:7001/api/auth/sign-in/social
Body: {"provider": "github"}
```
**预期结果**: ✅ 200 OK，返回 OAuth 重定向 URL

#### 1.1.4 手机号验证码
**请求**: `🔓 手机号发送验证码 (公开)`
```bash
POST http://localhost:7001/api/auth/phone-number/send-otp
Headers: x-captcha-response: XXXX.DUMMY.TOKEN.XXXX
Body: {"phoneNumber": "+8613611915632"}
```
**预期结果**: ✅ 200 OK，验证码发送成功（开发环境在响应中返回 OTP 代码）

#### 1.1.5 手机号登录
**请求**: `🔓 手机号码验证登录 (公开)`
```bash
POST http://localhost:7001/api/auth/phone-number/verify
Body: {
  "phoneNumber": "+8613611915632",
  "code": "123456"
}
```
**预期结果**: ✅ 200 OK (如果验证码正确)

#### 1.1.6 忘记密码
**请求**: `🔓 忘记密码发送 (公开)`
```bash
POST http://localhost:7001/api/auth/forget-password
Headers: x-captcha-response: XXXX.DUMMY.TOKEN.XXXX
Body: {
  "email": "test@example.com",
  "redirectTo": "/reset-password"
}
```
**预期结果**: ✅ 200 OK，重置邮件发送成功（开发环境在响应中返回重置链接）

#### 1.1.7 重置密码
**请求**: `🔓 忘记密码重设 (公开)`
```bash
POST http://localhost:7001/api/auth/reset-password
Body: {
  "newPassword": "newpassword123",
  "token": "reset-token-here"
}
```
**预期结果**: ✅ 200 OK (如果 token 有效)

#### 1.1.8 邮件验证
**请求**: `🔓 邮件验证 (公开)`
```bash
GET http://localhost:7001/api/auth/verify-email?token=verification-token&callbackURL=/
```
**预期结果**: ✅ 200 OK (如果 token 有效)

#### 1.1.9 重发验证邮件
**请求**: `🔓 再次发送验证邮件 (公开)`
```bash
POST http://localhost:7001/api/auth/send-verification-email
Headers: x-captcha-response: XXXX.DUMMY.TOKEN.XXXX
Body: {
  "email": "test@example.com",
  "callbackURL": "/zh-CN"
}
```
**预期结果**: ✅ 200 OK，验证邮件发送成功（开发环境在响应中返回验证链接）

### 1.2 验证码保护测试

#### 1.2.1 无验证码登录测试
```bash
POST http://localhost:7001/api/auth/sign-in/email
# 不包含 x-captcha-response header
Body: {
  "email": "test@example.com",
  "password": "password123"
}
```
**预期结果**: ❌ 400 Bad Request，提示缺少验证码

#### 1.2.2 无验证码注册测试
```bash
POST http://localhost:7001/api/auth/sign-up/email
# 不包含 x-captcha-response header
Body: {
  "email": "test@example.com",
  "password": "password123",
  "name": "Test"
}
```
**预期结果**: ❌ 400 Bad Request，提示缺少验证码

## 🔒 2. 需要登录的 API 端点测试

### 2.1 用户相关 API

#### 2.1.1 获取用户会话
**请求**: `🔒 获取用户状态 (需要登录)`
```bash
GET http://localhost:7001/api/auth/get-session
# 需要携带登录 cookie
```
**预期结果**: ✅ 200 OK，返回当前用户信息

#### 2.1.2 修改密码
**请求**: `🔒 修改密码 (需要登录)`
```bash
POST http://localhost:7001/api/auth/change-password
Body: {
  "newPassword": "newpassword123",
  "currentPassword": "password123",
  "revokeOtherSessions": true
}
```
**预期结果**: ✅ 200 OK，密码修改成功

#### 2.1.3 更新用户信息
**请求**: `🔒 修改用户信息 (需要登录)`
```bash
POST http://localhost:7001/api/auth/update-user
Body: {
  "name": "Updated Name",
  "image": "https://example.com/avatar.jpg"
}
```
**预期结果**: ✅ 200 OK，用户信息更新成功

#### 2.1.4 列出关联账户
**请求**: `🔒 列出账户信息 (需要登录)`
```bash
GET http://localhost:7001/api/auth/list-accounts
```
**预期结果**: ✅ 200 OK，返回用户关联的账户列表

### 2.2 订阅和支付相关 API

#### 2.2.1 获取订阅状态
**请求**: `🔒 订阅状态 (需要登录)`
```bash
GET http://localhost:7001/api/subscription/status
```
**预期结果**: ✅ 200 OK，返回用户订阅状态

**特殊状态测试 - 取消订阅(期末)**：
```bash
# 测试取消订阅状态 (cancelAtPeriodEnd = true)
GET http://localhost:7001/api/subscription/status
# 预期返回格式:
{
  "hasSubscription": true,
  "subscription": {
    "status": "active",
    "cancelAtPeriodEnd": true,
    "periodEnd": "2024-12-31T23:59:59.000Z"
  }
}
```
**验证要点**：
- ✅ `hasSubscription` 应为 `true`（用户仍可使用服务）
- ✅ `cancelAtPeriodEnd` 应为 `true`
- ✅ `status` 仍为 `active`
- ✅ `periodEnd` 显示订阅结束时间

#### 2.2.2 获取订单历史
**请求**: `🔒 订单历史 (需要登录)`
```bash
GET http://localhost:7001/api/orders
```
**预期结果**: ✅ 200 OK，返回用户订单列表

#### 2.2.3 支付初始化测试 - 所有计划和提供商

**Stripe 支付初始化**：
```bash
# Monthly Plan - Stripe
POST http://localhost:7001/api/payment/initiate
Body: {"planId": "monthly", "provider": "stripe"}

# Monthly Pro Plan - Stripe  
POST http://localhost:7001/api/payment/initiate
Body: {"planId": "monthly-pro", "provider": "stripe"}

# Lifetime Plan - Stripe
POST http://localhost:7001/api/payment/initiate
Body: {"planId": "lifetime", "provider": "stripe"}
```

**微信支付初始化**：
```bash
# Monthly Plan - 微信
POST http://localhost:7001/api/payment/initiate
Body: {"planId": "monthlyWechat", "provider": "wechat"}


```

**Creem 支付初始化**：
```bash
# Monthly Plan - Creem
POST http://localhost:7001/api/payment/initiate
Body: {"planId": "monthlyCreem", "provider": "creem"}


```

**预期结果**: ✅ 200 OK，返回对应支付方式的支付信息

#### 2.2.4 支付状态查询测试

**测试各支付提供商的状态查询**：
```bash
# Stripe 支付状态查询
GET http://localhost:7001/api/payment/query?orderId=STRIPE_ORDER_ID&provider=stripe

# 微信支付状态查询
GET http://localhost:7001/api/payment/query?orderId=WECHAT_ORDER_ID&provider=wechat

# Creem 支付状态查询
GET http://localhost:7001/api/payment/query?orderId=CREEM_ORDER_ID&provider=creem
```

**预期结果**: ✅ 200 OK，返回支付状态 (pending/completed/failed)

#### 2.2.5 支付验证测试

**验证不同支付方式的结果**：
```bash
# Stripe 支付验证
GET http://localhost:7001/api/payment/verify/stripe?provider=stripe&session_id=SESSION_ID&order_id=ORDER_ID

# 微信支付验证
GET http://localhost:7001/api/payment/verify/wechat?provider=wechat&transaction_id=TRANSACTION_ID&order_id=ORDER_ID

# Creem 支付验证
GET http://localhost:7001/api/payment/verify/creem?provider=creem&checkout_id=CHECKOUT_ID&order_id=ORDER_ID
```

**预期结果**: ✅ 200 OK，支付验证成功并更新订阅状态

#### 2.2.6 支付失败测试

**测试无效参数和错误场景**：
```bash
# 无效计划ID
POST http://localhost:7001/api/payment/initiate
Body: {"planId": "invalid_plan", "provider": "stripe"}
# 预期: ❌ 400 Bad Request

# 无效支付提供商
POST http://localhost:7001/api/payment/initiate
Body: {"planId": "monthly", "provider": "invalid_provider"}
# 预期: ❌ 400 Bad Request

# 查询不存在的订单
GET http://localhost:7001/api/payment/query?orderId=INVALID_ORDER_ID&provider=stripe
# 预期: ❌ 404 Not Found

# 查询他人订单
GET http://localhost:7001/api/payment/query?orderId=OTHER_USER_ORDER_ID&provider=stripe
# 预期: ❌ 403 Forbidden
```

#### 2.2.8 客户门户访问
**请求**: `🔒 订阅管理门户 (需要登录)`
```bash
POST http://localhost:7001/api/subscription/portal
Body: {}
```
**预期结果**: ✅ 200 OK，返回管理门户 URL

### 2.3 其他功能 API

#### 2.3.1 AI 聊天
**请求**: `🔒 AI 聊天 (需要登录)`
```bash
POST http://localhost:7001/api/chat
Body: {
  "message": "Hello, how are you?",
  "stream": false
}
```
**预期结果**: ✅ 200 OK，返回 AI 回复

#### 2.3.2 删除用户账户
**请求**: `🔒 删除用户 (需要登录)`
```bash
POST http://localhost:7001/api/auth/delete-user
Body: {}
```
**预期结果**: ✅ 200 OK，用户账户删除成功

## 🛡️ 3. 管理员 API 端点测试

### 3.1 管理员认证
**前置条件**: 使用管理员账户登录并保存认证 cookie

### 3.2 管理员用户管理 API

#### 3.2.1 创建用户
**请求**: `🛡️ 创建用户 (需要管理员权限)`
```bash
POST http://localhost:7001/api/auth/admin/create-user
Body: {
  "name": "Admin Created User",
  "email": "admin-created@test.com",
  "password": "password123",
  "role": "user",
  "data": {
    "emailVerified": true,
    "phoneNumberVerified": false,
    "banned": false
  }
}
```
**预期结果**: ✅ 200 OK，用户创建成功

#### 3.2.2 封禁用户
**请求**: `🛡️ 封禁用户 (需要管理员权限)`
```bash
POST http://localhost:7001/api/auth/admin/ban-user
Body: {
  "userId": "USER_ID_HERE",
  "banReason": "Violation of terms"
}
```
**预期结果**: ✅ 200 OK，用户封禁成功

#### 3.2.3 更新用户信息
**请求**: `🛡️ 更新用户 (需要管理员权限)`
```bash
PATCH http://localhost:7001/api/users/USER_ID
Body: {
  "name": "Updated by Admin",
  "email": "updated@test.com",
  "emailVerified": true,
  "role": "user",
  "banned": false
}
```
**预期结果**: ✅ 200 OK，用户信息更新成功

#### 3.2.4 获取所有用户
**请求**: `🛡️ 查询用户列表 (需要管理员权限)`
```bash
GET http://localhost:7001/api/admin/users?limit=10&offset=0&search=&sortBy=createdAt&sortOrder=desc
```
**预期结果**: ✅ 200 OK，返回用户列表

### 3.3 管理员数据管理 API

#### 3.3.1 查询所有订单
**请求**: `🛡️ 订单查询 (需要管理员权限)`
```bash
GET http://localhost:7001/api/admin/orders?limit=10&offset=0&sortBy=createdAt&sortOrder=desc
```
**预期结果**: ✅ 200 OK，返回所有用户的订单列表

#### 3.3.2 查询所有订阅
**请求**: `🛡️ 订阅查询 (需要管理员权限)`
```bash
GET http://localhost:7001/api/admin/subscriptions?limit=10&offset=0&sortBy=createdAt&sortOrder=desc
```
**预期结果**: ✅ 200 OK，返回所有用户的订阅列表

## ❌ 4. 错误场景和权限测试

### 4.1 未登录访问受保护 API

**测试步骤**: 清除所有 cookies，然后测试受保护的 API 端点

```bash
GET http://localhost:7001/api/auth/get-session
GET http://localhost:7001/api/subscription/status
GET http://localhost:7001/api/orders
POST http://localhost:7001/api/payment/initiate
GET http://localhost:7001/api/admin/users
```
**预期结果**: ❌ 401 Unauthorized

### 4.2 普通用户访问管理员 API

**测试步骤**: 使用普通用户 cookie 测试管理员端点

```bash
GET http://localhost:7001/api/admin/users
POST http://localhost:7001/api/auth/admin/create-user
POST http://localhost:7001/api/auth/admin/ban-user
GET http://localhost:7001/api/admin/orders
GET http://localhost:7001/api/admin/subscriptions
```
**预期结果**: ❌ 403 Forbidden

### 4.3 跨用户数据访问测试

**测试步骤**:
1. 创建两个不同的用户账户
2. 用户 A 登录，获取其订单 ID
3. 用户 B 登录，尝试访问用户 A 的数据

```bash
GET http://localhost:7001/api/payment/query?orderId=USER_A_ORDER_ID&provider=stripe
```
**预期结果**: ❌ 403 Forbidden 或 404 Not Found

### 4.4 无效 Token 测试

```bash
GET http://localhost:7001/api/auth/verify-email?token=invalid-token&callbackURL=/
POST http://localhost:7001/api/auth/reset-password
Body: {
  "newPassword": "newpass123",
  "token": "invalid-token"
}
```
**预期结果**: ❌ 400 Bad Request 或 401 Unauthorized

### 4.5 验证码保护绕过测试

**测试步骤**: 尝试绕过验证码保护的端点

```bash
# 尝试不带验证码的注册
POST http://localhost:7001/api/auth/sign-up/email
# 不包含 x-captcha-response header
Body: {"email": "test@example.com", "password": "password123", "name": "Test"}

# 尝试不带验证码的登录
POST http://localhost:7001/api/auth/sign-in/email
# 不包含 x-captcha-response header
Body: {"email": "test@example.com", "password": "password123"}
```
**预期结果**: ❌ 400 Bad Request，验证码验证失败

---

## 📊 测试结果记录

### 核心功能测试检查单

#### 手动界面测试
- [ ] 用户注册流程
- [ ] 用户登录流程  
- [ ] 忘记密码流程
- [ ] 手机号验证登录
- [ ] 用户账户管理
  - [ ] 用户信息更新
  - [ ] 修改密码功能
  - [ ] 删除账户功能
  - [ ] 仪表板导航
  - [ ] 关联账户管理
- [ ] AI 聊天功能
- [ ] 管理员功能
- [ ] 页面访问权限
- [ ] **定价页面订阅状态重定向** ✅

#### 支付流程完整测试 (5个计划组合)
**Stripe 支付测试**:
- [ ] Monthly Plan (monthly) - Stripe (含权限验证+数据清理)
- [ ] Monthly Pro Plan (monthly-pro) - Stripe (含权限验证+数据清理)
- [ ] Lifetime Plan (lifetime) - Stripe (含权限验证+数据清理)

**微信支付测试**:
- [ ] Monthly Plan WeChat (monthlyWechat) - 微信 (含权限验证+数据清理)

**Creem 支付测试**:
- [ ] Monthly Plan Creem (monthlyCreem) - Creem (含权限验证+数据清理)

**付费功能验证**:
- [ ] 未订阅用户访问付费功能 (应被拒绝)
- [ ] 已订阅用户访问付费功能 (应允许)
- [ ] **取消订阅(期末)用户访问付费功能 (应仍可访问)**
- [ ] 订阅过期用户访问付费功能 (应被拒绝)
- [ ] **验证取消订阅状态显示 (cancelAtPeriodEnd)**
- [ ] 订阅管理功能测试
- [ ] 支付失败场景测试

#### API 测试
- [ ] 公开认证 API
- [ ] 验证码保护测试
- [ ] 用户相关 API
- [ ] 支付初始化 API (5个计划组合)
- [ ] 支付状态查询 API (3个支付方式)
- [ ] 支付验证 API (3个支付方式)
- [ ] 支付失败场景 API 测试
- [ ] 订阅管理 API
- [ ] 管理员 API
- [ ] 权限边界测试

#### 错误场景测试
- [ ] 未登录访问受保护 API
- [ ] 普通用户访问管理员 API
- [ ] 跨用户数据访问测试
- [ ] 无效 Token 测试
- [ ] 验证码保护绕过测试
- [ ] 支付参数验证测试

### 状态说明
- ✅ 测试通过
- ❌ 测试失败
- ⚠️ 部分通过
- ⏳ 待测试

---

## 🔍 常见问题排查

### 开发环境特殊说明
- **验证链接**: 开发环境会在控制台显示验证链接，无需检查邮件
- **OTP 代码**: 开发环境会在 API 响应中返回 OTP 代码
- **邮件服务**: 开发环境不会实际发送邮件或短信

### 数据清理重要说明
> **⚠️ 必须执行**: 每个支付测试完成后务必清理测试数据，否则会影响后续测试结果的准确性。

**快速清理命令** (推荐):
```sql
-- 替换 'TEST_USER_EMAIL' 为实际测试用户邮箱
DELETE FROM "order" WHERE "userId" = (SELECT "id" FROM "user" WHERE "email" = 'TEST_USER_EMAIL');
DELETE FROM "subscription" WHERE "userId" = (SELECT "id" FROM "user" WHERE "email" = 'TEST_USER_EMAIL');
```

**清理验证步骤**:
1. 清理数据后，用户仪表板应显示"未订阅"状态
2. 访问 `/zh-CN/ai` 应被重定向到定价页面
3. 再次执行相同支付测试应能正常进行

### 测试失败排查
1. **登录失败**: 检查验证码、用户状态、密码正确性
2. **API 401**: 确认登录状态、cookie 设置、会话有效性
3. **API 403**: 确认用户权限、角色分配、访问范围
4. **支付问题**: 确认提供商配置、订单归属、权限验证
5. **重复支付失败**: 检查是否未清理上次测试的订阅数据
6. **权限验证失败**: 确认订阅状态是否正确更新，检查缓存
7. **定价页面重定向失败**: 确认已订阅用户访问 `/pricing` 时是否正确重定向到 `/dashboard`
8. **取消订阅状态显示问题**: 
   - 检查数据库中 `cancelAtPeriodEnd` 字段是否为 `true`
   - 确认界面显示"期末取消"而不是"有效"状态
   - 验证用户仍可访问付费功能直到订阅期结束
   - 检查是否显示正确的取消说明文字

---

*测试计划最后更新: 2024年12月*