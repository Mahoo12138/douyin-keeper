# 微信支付配置

微信支付是中国大陆地区最主要的支付方式，适合面向中国用户的应用（需要企业资质，个人无法申请）。

## 📑 目录

- [📋 申请流程](#-申请流程)
- [🔑 环境变量配置](#-环境变量配置)
- [📋 证书格式转换](#-证书格式转换)
- [🔒 验证方式说明](#-验证方式说明)
- [📥 获取微信支付公钥（可选）](#-获取微信支付公钥可选)
- [⚠️ 注意事项](#️-注意事项)
- [🛠️ 计划配置示例](#️-计划配置示例)

## 📋 申请流程

1. **注册微信商户平台账号**
   - 访问 [微信支付商户平台](https://pay.weixin.qq.com/)
   - 准备企业营业执照、法人身份证等资料
   - 完成企业认证和账户审核（通常需要1-7个工作日）

2. **获取必要参数**
   - **App ID**: 微信公众号或小程序的应用ID
   - **商户号 (Mch ID)**: 微信支付分配的商户号
   - **API密钥 (API Key)**: 在商户平台的账户设置中生成

3. **下载支付证书**
   - 在商户平台的"账户中心" → "API安全"中下载证书
   - 下载 `apiclient_key.pem`（私钥）和 `apiclient_cert.pem`（证书）
   - 将证书内容转换为环境变量格式（见下方配置说明）

4. **获取微信支付公钥（推荐，非必需）**
   
   微信支付提供两种签名验证方式：
   
   **方式1：微信支付公钥验证（推荐）**
   - ✅ 官方推荐的新方式（2024年推出）
   - ✅ 性能更好，无需额外网络请求
   - ✅ 无有效期限制，更稳定
   - ⚙️ 需要手动配置环境变量
   
   **方式2：平台证书验证（自动回退）**
   - 🔄 传统验证方式
   - 🔄 **当未配置公钥时自动使用**
   - ❌ 系统内部会多发一次请求获取证书
   - ⚠️ 证书有5年有效期

5. **配置回调域名**
  - 在环境变量中设置，请看环境变量配置环节

## 🔑 环境变量配置

在 `.env` 文件中添加：

```env
# WeChat Pay 微信支付配置
WECHAT_PAY_APP_ID=wx1234567890abcdef    # 微信应用ID
WECHAT_PAY_MCH_ID=1234567890            # 商户号
WECHAT_PAY_API_KEY=your-32-char-api-key # API密钥
# 需要设置成为公网地址，使用内网穿透工具, 后面的 endpoint /api/payment/webhook/wechat 不需要修改
# 具体工具教程请参看 支付测试指南
WECHAT_PAY_NOTIFY_URL=https://yourdomain.com/api/payment/webhook/wechat

# 微信支付证书配置（必需）- 商户证书，用于请求签名
WECHAT_PAY_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
WECHAT_PAY_PUBLIC_KEY="-----BEGIN CERTIFICATE-----\nMIIEpDCCA4ygAwIBAgIU...\n-----END CERTIFICATE-----"

# 微信支付公钥验证（推荐，非必需）
# 配置后可获得更好性能，未配置时自动使用平台证书验证（会增加一次网络请求）
WECHAT_PAY_PAYMENT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----"
WECHAT_PAY_PUBLIC_KEY_ID="PUB_KEY_ID_0000000000000024101100397200000006"
```

## 📋 证书格式转换

如果你已有证书文件，需要将其转换为单行格式：

```bash
# 转换商户私钥
awk '{printf "%s\\n", $0}' apiclient_key.pem

# 转换商户证书  
awk '{printf "%s\\n", $0}' apiclient_cert.pem

# 转换微信支付公钥（从商户平台下载的 .pem 文件）
awk '{printf "%s\\n", $0}' pub_key.pem
```

将输出结果分别复制到对应的环境变量中。

## 🔒 验证方式说明

系统支持两种签名验证方式，会智能选择最佳方案：

| 验证方式 | 配置要求 | 性能影响 | 是否必需 | 说明 |
|---------|---------|---------|---------|------|
| **微信支付公钥验证** | `WECHAT_PAY_PAYMENT_PUBLIC_KEY` + `WECHAT_PAY_PUBLIC_KEY_ID` | ⚡ 性能最佳 | ❌ **非必需** | 2024年推出，无有效期，推荐配置 |
| 平台证书验证 | 仅需商户证书 | 🔄 额外网络请求 | ✅ **自动回退** | 未配置公钥时自动使用，证书5年有效期 |

**配置建议**：
- 🚀 **最佳性能**：配置微信支付公钥（避免额外网络请求）
- 🔄 **最简配置**：仅配置商户证书（系统自动处理，但性能略低）
- 🛡️ **推荐方案**：同时配置，获得最佳性能和兼容性

## 📥 获取微信支付公钥（可选）

> **⚡ 性能提示**：配置微信支付公钥可避免系统内部的额外网络请求，提升支付验证性能。未配置时系统会自动使用平台证书验证（功能完全正常，但会有额外的网络开销）。

**仅当需要最佳性能时才需要以下步骤**：

1. **登录微信支付商户平台**
   - 访问 [微信支付商户平台](https://pay.weixin.qq.com/)
   - 使用超级管理员或安全联系人账号登录

2. **进入API安全页面**
   - 点击左侧菜单的"账户中心"
   - 选择"API安全"子菜单

3. **申请并下载公钥**
   - 在页面中找到"微信支付公钥"部分
   - 点击"申请公钥"按钮
   - 下载生成的公钥文件（.pem格式）

4. **获取公钥ID**
   - 在下载页面或公钥详情页面可以看到公钥ID
   - 公钥ID格式类似：`PUB_KEY_ID_0000000000000024101100397200000006`
   - 复制此ID用于环境变量配置

5. **配置环境变量**
   - 使用上面的转换命令将公钥文件转换为单行格式
   - 分别配置 `WECHAT_PAY_PAYMENT_PUBLIC_KEY` 和 `WECHAT_PAY_PUBLIC_KEY_ID`

📖 **参考文档**：[微信支付公钥验证指引](https://pay.weixin.qq.com/doc/v3/merchant/4013053249)

💡 **快速开始**：如果想快速开始，可以跳过此步骤，仅配置商户证书即可正常使用微信支付功能。

## ⚠️ 注意事项

- 微信支付只支持 CNY (人民币) 币种
- 仅支持单次付费，不支持订阅模式
- 需要企业资质，个人无法申请
- 回调地址必须使用 HTTPS
- 证书内容包含敏感信息，请确保环境变量安全
- **推荐配置微信支付公钥**：非必需，但可获得更好性能（避免额外网络请求）
- **自动回退机制**：未配置公钥时，系统会自动使用平台证书验证

## 🛠️ 计划配置示例

```typescript
monthlyWechat: {
  provider: 'wechat',           // 指定支付提供商
  id: 'monthlyWechat',          // 每种支付方案需要分配一个不同的 id
  amount: 0.01,                 // 金额 (分)
  currency: 'CNY',              // 币种
  duration: {
    months: 1,
    type: 'one_time'            // 微信支付只支持单次付费
  },
  i18n: {
    'en': {
      name: 'Monthly Plan',
      description: 'Perfect for short-term projects',
      duration: 'month',
      features: ['All premium features', 'Priority support']
    },
    'zh-CN': {
      name: '月度订阅wechat',
      description: '每月订阅，灵活管理',
      duration: '月',
      features: ['所有高级功能', '优先支持']
    }
  }
}
```

---

返回 [支付配置概览](./overview.md)
