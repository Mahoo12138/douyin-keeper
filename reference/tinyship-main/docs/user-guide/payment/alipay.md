# 支付宝配置

支付宝是中国大陆地区主流的支付方式之一，适合面向中国用户的应用。

## 📑 目录

- [📋 申请流程](#-申请流程)
- [🔑 环境变量配置](#-环境变量配置)
- [📋 密钥格式转换](#-密钥格式转换)
- [🧪 沙盒环境测试](#-沙盒环境测试)
- [⚠️ 注意事项](#️-注意事项)
- [🛠️ 计划配置示例](#️-计划配置示例)

## 📋 申请流程

1. **注册支付宝开放平台账号**
   - 访问 [支付宝开放平台](https://open.alipay.com/)
   - 使用企业支付宝账号登录或注册
   - 完成企业认证（需要营业执照等资料）

2. **创建应用**
   - 在控制台创建"网页/移动应用"
   - 选择"电脑网站支付"能力
   - 提交应用审核

3. **配置密钥**
   - 在"应用详情" → "开发设置"中配置密钥
   - 推荐使用 **RSA2 (SHA256)** 签名方式
   - 生成应用公私钥对，下载并保存
   - 上传应用公钥到支付宝，获取**支付宝公钥**

4. **获取必要参数**
   - **App ID**: 应用的唯一标识
   - **应用私钥**: 用于签名请求
   - **支付宝公钥**: 用于验证支付宝返回的签名

5. **配置回调地址**
   - 在应用设置中配置授权回调地址
   - 确保回调地址可公网访问

## 🔑 环境变量配置

在 `.env` 文件中添加：

```env
# Alipay 支付宝配置
ALIPAY_APP_ID=2021000000000000              # 应用 App ID

# 支付宝密钥配置（必需）- 纯 Base64 字符串格式
# 应用私钥: 用于签名 API 请求（从密钥生成工具生成）
ALIPAY_APP_PRIVATE_KEY="MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC..."

# 支付宝公钥: 用于验证支付宝回调签名（从支付宝开放平台获取，不是你的应用公钥！）
ALIPAY_PUBLIC_KEY="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgatiwfGM3RTw..."

# 异步通知回调地址 - 需要公网可访问
# 本地开发请使用内网穿透工具
ALIPAY_NOTIFY_URL=https://yourdomain.com/api/payment/webhook/alipay

# 沙盒模式（可选，默认 false）
# 设置为 "true" 使用沙盒环境进行测试
ALIPAY_SANDBOX=false
```

## 📋 密钥格式说明

支付宝使用的是**纯 Base64 字符串格式**，不需要 PEM 头尾（`-----BEGIN...-----`）。

### 获取密钥

1. **应用私钥**
   - 使用支付宝提供的 [密钥生成工具](https://opendocs.alipay.com/common/02kipl) 生成
   - 选择 RSA2 (SHA256) 签名算法
   - 复制生成的私钥（纯 Base64 字符串）

2. **支付宝公钥**
   - 将应用公钥上传到支付宝开放平台
   - 支付宝会返回"支付宝公钥"
   - 复制这个支付宝公钥（纯 Base64 字符串）

### 密钥格式对比

```
✅ 正确格式（纯 Base64 字符串）:
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgatiwfGM3RTwpedahWmpzO...

❌ 错误格式（带 PEM 头尾）:
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgatiwfGM3RTwpedahWmpzO...
-----END PUBLIC KEY-----
```

### 密钥类型说明

| 密钥类型 | 来源 | 用途 | 配置位置 |
|---------|------|------|---------|
| **应用私钥** | 密钥生成工具生成 | 签名 API 请求 | `ALIPAY_APP_PRIVATE_KEY` |
| **应用公钥** | 密钥生成工具生成 | 上传到支付宝平台 | ❌ 不需要配置 |
| **支付宝公钥** | 支付宝平台返回 | 验证支付宝回调签名 | `ALIPAY_PUBLIC_KEY` |

**⚠️ 重要提醒**：不要混淆"应用公钥"和"支付宝公钥"！
- **应用公钥**：你生成的，上传到支付宝平台
- **支付宝公钥**：支付宝返回给你的，用于验签

## 🧪 沙盒环境测试

支付宝提供沙盒环境用于开发测试，无需真实支付。

### 启用沙盒模式

1. **设置环境变量**
   ```env
   ALIPAY_SANDBOX=true
   ```

2. **获取沙盒账号**
   - 登录 [支付宝开放平台沙盒](https://openhome.alipay.com/develop/sandbox/app)
   - 获取沙盒 App ID 和密钥
   - 下载沙盒版支付宝 App 或使用沙盒买家账号

3. **沙盒环境特点**
   - 使用独立的沙盒网关：`https://openapi-sandbox.dl.alipaydev.com/gateway.do`
   - 测试账号余额虚拟，不会产生真实扣款
   - 功能与生产环境一致

### 沙盒测试流程

1. 使用沙盒 App ID 配置应用
2. 发起支付，系统会跳转到沙盒支付页面
3. 使用沙盒买家账号登录并支付
4. 验证 Webhook 回调和订单状态更新

📖 **参考文档**：[支付宝沙盒环境使用指南](https://opendocs.alipay.com/open/00dn7o)

## ⚠️ 注意事项

- 支付宝只支持 **CNY (人民币)** 币种
- 目前仅支持 **单次付费**，不支持订阅模式
- 使用 **电脑网站支付 (alipay.trade.page.pay)** 接口，用户会跳转到支付宝页面完成支付
- 回调地址必须使用 **HTTPS**
- 密钥内容包含敏感信息，请确保环境变量安全
- Webhook 返回格式为纯文本 `success` 或 `fail`，不是 JSON
- 签名验证使用 `checkNotifySignV2` 方法

## 🛠️ 计划配置示例

```typescript
monthlyAlipay: {
  provider: 'alipay',           // 指定支付提供商
  id: 'monthlyAlipay',          // 每种支付方案需要分配一个不同的 id
  amount: 0.01,                 // 金额 (元)
  currency: 'CNY',              // 币种
  duration: {
    months: 1,
    type: 'one_time'            // 支付宝只支持单次付费
  },
  i18n: {
    'en': {
      name: 'Alipay Monthly Plan',
      description: 'Monthly one time pay via Alipay',
      duration: 'month',
      features: ['All premium features', 'Priority support']
    },
    'zh-CN': {
      name: '支付宝月度',
      description: '通过支付宝的月度一次性支付',
      duration: '月',
      features: ['所有高级功能', '优先支持']
    }
  }
}
```

## 🔄 支付流程

### 电脑网站支付流程

```
用户选择计划 → 创建订单 → 生成支付表单 → 
跳转支付宝页面 → 用户登录支付 → 
支付宝回调 returnUrl → Webhook 异步通知 → 
订单状态更新 → 订阅激活
```

### 关键特性

- **跳转支付**：使用 `pageExecute` 生成 HTML 表单，自动提交跳转到支付宝
- **同步返回**：支付完成后用户被重定向到 `returnUrl`
- **异步通知**：支付宝发送 Webhook 到 `notifyUrl`，需返回 `success`
- **订单查询**：可通过 `queryOrder` 主动查询订单状态

---

返回 [支付配置概览](./overview.md)
