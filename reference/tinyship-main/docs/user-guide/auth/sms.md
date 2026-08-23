# 短信验证登录配置

短信验证提供了基于手机号的一次性密码（OTP）认证功能。

## 📑 目录

- [支持的短信服务商](#支持的短信服务商)
- [阿里云短信配置](#阿里云短信配置)
- [腾讯云短信配置](#腾讯云短信配置)
- [Twilio 短信配置](#twilio-短信配置)
- [修改配置文件](#修改配置文件)
- [开发环境建议](#开发环境建议)
- [扩展短信功能](#扩展短信功能)

## 支持的短信服务商

目前支持阿里云（国内）、腾讯云（国内外）和 Twilio（国际）三种，你可以按需求进行选择：

* [阿里云短信](https://www.aliyun.com/product/sms) **特别注意：现在使用阿里云短信需要时企业用户，现在有签名报备制度，个人无法通过报备**
* [腾讯云短信](https://cloud.tencent.com/product/sms) **支持国内和国际短信，同样需要企业认证和签名报备**
* [Twilio](https://www.twilio.com/docs/messaging) **适合出海应用，支持除中国之外的大部分国家**

## 阿里云短信配置

在 `.env` 文件中添加：

```env
ALIYUN_ACCESS_KEY_ID="your_aliyun_key_id"
ALIYUN_ACCESS_KEY_SECRET="your_aliyun_key_secret"
ALIYUN_SMS_SIGN_NAME="your-sms-sign-name" #签名名称
ALIYUN_SMS_TEMPLATE_CODE="SMS_000000000" #模版Code
```

## 腾讯云短信配置

在 `.env` 文件中添加（凭证复用腾讯云通用密钥，与 COS 等服务共享）：

```env
TENCENT_SECRET_ID="your-tencent-secret-id"
TENCENT_SECRET_KEY="your-tencent-secret-key"
TENCENT_SMS_SDK_APP_ID="1400006666"
TENCENT_SMS_SIGN_NAME="your-sign-name"
TENCENT_SMS_TEMPLATE_ID="123456"
```

## Twilio 短信配置

在 `.env` 文件中添加：

```env
TWILIO_ACCOUNT_SID="your_twilio_account_sid"
TWILIO_AUTH_TOKEN="your_twilio_auth_token"
TWILIO_DEFAULT_FROM="+1234567890"
```

## 修改配置文件

`config/sms.ts` 包含短信服务的配置：

```typescript
// config/sms.ts
export const smsConfig = {
  /**
   * Default SMS Provider
   */
  defaultProvider: 'aliyun',
  // ...其他配置
}
```

默认使用的是阿里云发送。配置完毕以后应该就在注册的时候成功的发送验证短信了。

## 开发环境建议

**开发环境建议**: 测试完成后，建议在开发环境注释掉短信发送代码，直接保留 `console.log` 输出打印出的 code 即可，避免产生不必要的费用。

同时如果想在 HTTP 响应中查看，我们的代码中已经将它添加到一个临时字段中：

```typescript
// 开发环境：将 OTP 代码存储到 context 中，通过 hooks 返回
if (process.env.NODE_ENV === 'development') {
  (request as any).context = (request as any).context || {};
  (request as any).context.otpCode = code;
  console.log('📱 [DEVELOPMENT MODE] OTP code stored in context:', code);
}
```

你可以查看 network 来获取对应的信息详情。

## 扩展短信功能

除了认证短信，你还可以扩展短信服务用于：
- 📧 营销短信
- 🔔 通知短信
- 🚨 安全警报
- 自定义验证流程

详细配置请参考：[短信服务文档](../../../libs/sms/README.md)

---

返回 [认证配置概览](./overview.md)
