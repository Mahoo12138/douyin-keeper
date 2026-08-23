# AGENTS.md

## Overview

Unified SMS service supporting multiple providers (Aliyun, Tencent, Twilio) with template-based and direct message sending. Handles both Chinese domestic and international phone numbers with configurable default providers.

## Setup Commands

```bash
# Environment configuration required
# Add to .env file:
ALIYUN_ACCESS_KEY_ID=your_access_key_id
ALIYUN_ACCESS_KEY_SECRET=your_access_key_secret
ALIYUN_SMS_SIGN_NAME=your_sms_sign_name
ALIYUN_SMS_TEMPLATE_CODE=SMS_000000000

TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_DEFAULT_FROM=+1234567890

# Tencent Cloud SMS (reuses TENCENT_SECRET_ID/KEY)
TENCENT_SMS_SDK_APP_ID=1400006666
TENCENT_SMS_SIGN_NAME=your_sign_name
TENCENT_SMS_TEMPLATE_ID=123456

# Configuration via @config with optional service pattern
```

## Code Style

- Multi-provider architecture with explicit provider selection
- Template SMS (Aliyun/Tencent) vs direct message (Twilio) patterns
- Phone number format auto-handling (handles +86 prefix conversion)
- Environment variable configuration with getter functions
- Detailed error types with provider information
- TypeScript interfaces for all SMS types and responses

## Usage Examples

### Aliyun SMS (Template-based)

```typescript
import { sendSMS } from '@libs/sms';

// Using Aliyun with explicit template
await sendSMS({
  to: '+8613800138000',
  templateCode: 'SMS_235815655',
  templateParams: { code: '123456' },
  provider: 'aliyun'
});

// Using default template from environment variable
await sendSMS({
  to: '+8613800138000',
  templateParams: { code: '123456' },
  provider: 'aliyun'  // Uses ALIYUN_SMS_TEMPLATE_CODE
});
```

### Tencent Cloud SMS (Template-based)

```typescript
import { sendSMS } from '@libs/sms';

// Using Tencent with explicit template
await sendSMS({
  to: '+8613800138000',
  templateCode: '123456',
  templateParams: { code: '8888' },
  provider: 'tencent'
});

// Using default template from environment variable
await sendSMS({
  to: '+8613800138000',
  templateParams: { code: '8888' },
  provider: 'tencent'  // Uses TENCENT_SMS_TEMPLATE_ID
});
```

### Twilio SMS (Direct message)

```typescript
import { sendSMS } from '@libs/sms';

// Direct message sending
await sendSMS({
  to: '+14155552671',
  message: 'Your verification code is: 123456',
  provider: 'twilio'
});
```

### Using Default Provider

```typescript
// If defaultProvider is set in config
await sendSMS({
  to: '+8613800138000',
  templateParams: { code: '123456' }
  // Uses default provider from config
});
```

### Error Handling

```typescript
const result = await sendSMS({
  to: '+8613800138000',
  templateParams: { code: '123456' },
  provider: 'aliyun'
});

if (!result.success) {
  console.error('SMS failed:', result.error?.message);
  console.error('Provider:', result.error?.provider);
  
  switch (result.error?.name) {
    case 'MissingProvider':
      // Handle missing provider error
      break;
    case 'AliyunSMSError':
      // Handle Aliyun-specific errors
      break;
    case 'TencentSMSError':
      // Handle Tencent-specific errors
      break;
    case 'TwilioSMSError':
      // Handle Twilio-specific errors
      break;
  }
}
```

## Common Tasks

### Provider Selection Guide

| Provider | Use Case | Message Type | Phone Numbers |
|----------|----------|--------------|---------------|
| **Aliyun** | China domestic | Template SMS | Chinese numbers (+86) |
| **Tencent** | China + International | Template SMS | E.164 format |
| **Twilio** | International | Direct message | Global numbers |

### Supported Phone Formats

- `13800138000` - 11-digit Chinese number
- `+8613800138000` - Chinese with international prefix
- `+14155552671` - US number
- `+44...` - Other international numbers

### Configuration Structure

```typescript
// In config.ts
sms: {
  defaultProvider: 'aliyun',
  aliyun: {
    get accessKeyId() { return getEnvForService('ALIYUN_ACCESS_KEY_ID', 'Aliyun SMS'); },
    get accessKeySecret() { return getEnvForService('ALIYUN_ACCESS_KEY_SECRET', 'Aliyun SMS'); },
    get signName() { return getEnvForService('ALIYUN_SMS_SIGN_NAME', 'Aliyun SMS'); },
    get templateCode() { return getEnvForService('ALIYUN_SMS_TEMPLATE_CODE', 'Aliyun SMS'); },
  },
  twilio: {
    get accountSid() { return getEnvForService('TWILIO_ACCOUNT_SID', 'Twilio SMS'); },
    get authToken() { return getEnvForService('TWILIO_AUTH_TOKEN', 'Twilio SMS'); },
    get defaultFrom() { return getEnvForService('TWILIO_DEFAULT_FROM', 'Twilio SMS'); },
  },
  tencent: {
    get secretId() { return getEnvForService('TENCENT_SECRET_ID', 'Tencent SMS'); },
    get secretKey() { return getEnvForService('TENCENT_SECRET_KEY', 'Tencent SMS'); },
    get smsSdkAppId() { return getEnvForService('TENCENT_SMS_SDK_APP_ID', 'Tencent SMS'); },
    get signName() { return getEnvForService('TENCENT_SMS_SIGN_NAME', 'Tencent SMS'); },
    get templateId() { return getEnvForService('TENCENT_SMS_TEMPLATE_ID', 'Tencent SMS'); },
    get region() { return getEnv('TENCENT_SMS_REGION') || 'ap-guangzhou'; },
  },
}
```

### Add New Provider

1. Add environment variables to `.env`
2. Update configuration in `config.ts` with getter functions
3. Create provider implementation in `providers/`
4. Add provider type to `types.ts`
5. Add case handling in `sms-sender.ts`

## Testing Instructions

```bash
# Test SMS configuration
# 1. Verify all required environment variables are set
# 2. Test Aliyun SMS with Chinese phone numbers
# 3. Test Tencent SMS with Chinese/international numbers
# 4. Test Twilio SMS with international numbers
# 4. Verify template parameter substitution
# 5. Test error handling for missing configurations

# Provider testing
# 1. Test phone number format conversion
# 2. Verify template code handling (default vs explicit)
# 3. Test different error scenarios
# 4. Verify logging output shows correct provider usage
```

## Troubleshooting

### Configuration Issues
- Check all required environment variables are set for chosen provider
- Verify getter functions in config work properly
- Ensure `defaultProvider` is set if not specifying provider explicitly

### Aliyun SMS Problems
- Verify template code exists in Aliyun console
- Check sign name is approved and matches configuration
- Ensure phone number format is correct (Chinese numbers only)
- Verify template parameters match template placeholders

### Tencent SMS Problems
- Verify TENCENT_SECRET_ID/TENCENT_SECRET_KEY are configured (shared with COS)
- Check SmsSdkAppId matches the app created in Tencent SMS console
- Verify template ID exists and is approved in Tencent console
- Ensure sign name is approved and matches configuration
- Check phone number is in E.164 format (+8613800138000)

### Twilio SMS Problems
- Check account SID and auth token validity
- Verify sending phone number is properly configured
- Ensure recipient number is in correct international format
- Check Twilio account balance and sending limits

### Phone Number Format Issues
- System auto-handles +86 prefix for Aliyun
- International numbers need full format (+country code)
- Check logs for phone number formatting details

## Architecture Notes

- **Multi-Provider**: Supports Aliyun (template-based), Tencent (template-based), and Twilio (direct message)
- **Phone Format Handling**: Automatic conversion for different providers
- **Template System**: Environment variable defaults with override capability
- **Configuration Pattern**: Getter functions for runtime environment variable access
- **Error Handling**: Provider-specific error types with detailed information
- **Optional Service**: Uses `getEnvForService` for graceful degradation when not configured
- **Logging**: Comprehensive logging for debugging and monitoring
- **Extensible**: Easy addition of new SMS providers following established patterns