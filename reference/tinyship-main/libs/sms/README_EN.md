# SMS Service

This service provides a unified SMS sending interface that supports multiple SMS service providers. Currently supports Aliyun and Twilio, with users needing to explicitly specify the service provider. It can be easily extended to support other providers.

## 🚀 Core Features

- **Multi-Provider Support**: Supports Aliyun and Twilio SMS services
- **Multiple Sending Methods**: Supports template SMS (Aliyun) and direct content SMS (Twilio)
- **International Support**: Supports mainland China and international phone numbers
- **Type Safety**: Complete TypeScript type support
- **Unified Interface**: Same calling interface for different providers

## 📱 Provider Selection

Users need to explicitly specify the SMS service provider based on their specific needs:

| Provider | Use Case | Description |
|----------|----------|-------------|
| Aliyun | Mainland China numbers | Uses template mechanism, lower cost |
| Twilio | International numbers | Supports global sending |

**Supported Number Formats:**
- `13800138000` - 11-digit China number
- `+8613800138000` - China number with international prefix
- `+14155552671` - US number
- `+44...` - Other international numbers

## Configuration

### Environment Variables

Configure sensitive information in the `.env` file:

```env
# Aliyun SMS Configuration
ALIYUN_ACCESS_KEY_ID=your_access_key_id
ALIYUN_ACCESS_KEY_SECRET=your_access_key_secret
ALIYUN_SMS_SIGN_NAME=your_sms_sign_name
ALIYUN_SMS_TEMPLATE_CODE=SMS_000000000

# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_DEFAULT_FROM=+1234567890
```

### Configuration File

SMS configuration in `config.ts` (as an optional service):

```typescript
export const config = {
  sms: {
    defaultProvider: 'aliyun',

    aliyun: {
      // Optional service, shows warning instead of error when missing
      get accessKeyId() {
        return getEnvForService('ALIYUN_ACCESS_KEY_ID', 'Aliyun SMS');
      },
      get accessKeySecret() {
        return getEnvForService('ALIYUN_ACCESS_KEY_SECRET', 'Aliyun SMS');
      },
      get endpoint() {
        return getEnvForService('ALIYUN_SMS_ENDPOINT', 'Aliyun SMS') || 'dysmsapi.aliyuncs.com';
      },
      get signName() {
        return getEnvForService('ALIYUN_SMS_SIGN_NAME', 'Aliyun SMS');
      },
      get templateCode() {
        return getEnvForService('ALIYUN_SMS_TEMPLATE_CODE', 'Aliyun SMS');
      },
    },

    twilio: {
      // Optional service, shows warning instead of error when missing
      get accountSid() {
        return getEnvForService('TWILIO_ACCOUNT_SID', 'Twilio SMS');
      },
      get authToken() {
        return getEnvForService('TWILIO_AUTH_TOKEN', 'Twilio SMS');
      },
      get defaultFrom() {
        return getEnvForService('TWILIO_DEFAULT_FROM', 'Twilio SMS');
      },
    }
  }
};
```

## Usage

### Basic Usage

```typescript
import { sendSMS } from '@libs/sms';

// Send SMS using Aliyun (provider must be specified)
await sendSMS({
  to: '+8613800138000',
  templateCode: 'SMS_235815655',      // Optional, uses default template from config if not provided
  templateParams: { code: '123456' },
  provider: 'aliyun'
});

// Send SMS using Twilio (provider must be specified)
await sendSMS({
  to: '+14155552671',
  message: 'Your verification code is: 123456',
  provider: 'twilio'
});
```

### Using Default Provider

If `defaultProvider` is set in the configuration file, you can omit the provider:

```typescript
// Use default provider from config (if defaultProvider: 'aliyun' is set)
await sendSMS({
  to: '+8613800138000',
  templateParams: { code: '123456' }
  // templateCode can be omitted, uses ALIYUN_SMS_TEMPLATE_CODE environment variable
  // provider can be omitted, uses the default one
});
```

### Optimized Aliyun Configuration Usage

```typescript
// If default template code is configured in environment variables, calls can be simplified
await sendSMS({
  to: '+8613800138000',
  templateParams: { code: '123456' },
  provider: 'aliyun'  // Uses template code from environment variables
});

// You can also explicitly specify template code to override default values
await sendSMS({
  to: '+8613800138000',
  templateCode: 'SMS_CUSTOM_TEMPLATE',  // Override default value from environment variables
  templateParams: { code: '123456' },
  provider: 'aliyun'
});
```

## 🔧 Type System

### Common Interface

```typescript
interface SMSOptions {
  to: string;                  // Phone number
  message?: string;            // Message content (required for Twilio)
  templateCode?: string;       // Template code (required for Aliyun)
  templateParams?: Record<string, string>; // Template parameters
  from?: string;              // Sender phone number
  provider?: 'aliyun' | 'twilio'; // Service provider
}
```

### Provider-Specific Interfaces

```typescript
// Aliyun-specific (template SMS)
interface AliyunSMSOptions {
  to: string;
  templateCode: string;        // Required
  templateParams?: Record<string, string>;
}

// Twilio-specific (direct content)
interface TwilioSMSOptions {
  to: string;
  message: string;            // Required
  from?: string;
}
```

### Response Format

```typescript
interface SMSResponse {
  success: boolean;
  messageId?: string;         // Message ID
  requestId?: string;         // Request ID (Aliyun)
  error?: {
    message: string;
    name: string;
    provider?: 'aliyun' | 'twilio';
  } | null;
}
```

## 🏗️ Architecture Design

```
User Call (explicitly specify provider)
    ↓
SMS Sender (validation and routing)
    ↓
┌─────────────┬─────────────┐
│   Aliyun    │   Twilio    │
│  Templates  │   Direct    │
│ China nums  │ Intl nums   │
└─────────────┴─────────────┘
```

## 📋 Provider Features

### Aliyun SMS
- **Use Case**: Mainland China phone numbers
- **Sending Method**: Template SMS
- **Number Format**: Automatically handles `+86` prefix
- **Required Parameters**: `templateCode`
- **Optional Parameters**: `templateParams`

### Twilio SMS  
- **Use Case**: International phone numbers (including China)
- **Sending Method**: Direct message content
- **Number Format**: Requires complete international format (`+` prefix)
- **Required Parameters**: `message`
- **Optional Parameters**: `from`

## 🔍 Error Handling

```typescript
const result = await sendSMS({
  to: '+8613800138000',
  templateParams: { code: '123456' },
  provider: 'aliyun'  // or use default provider
});

if (!result.success) {
  console.error('SMS sending failed:', result.error?.message);
  console.error('Error type:', result.error?.name);
  console.error('Provider:', result.error?.provider);
  
  // Handle based on error type
  switch (result.error?.name) {
    case 'MissingProvider':
      console.error('SMS provider not specified');
      break;
    case 'AliyunSMSError':
      console.error('Aliyun SMS service error');
      break;
    case 'TwilioSMSError':
      console.error('Twilio SMS service error');
      break;
    default:
      console.error('Unknown error');
  }
} else {
  console.log('SMS sent successfully:', result.messageId);
  if (result.requestId) {
    console.log('Request ID:', result.requestId);  // Provided by Aliyun
  }
}
```

## 🚀 Adding New Service Providers

1. **Add Environment Variables**
   ```env
   NEW_PROVIDER_API_KEY=your_api_key
   ```

2. **Update Configuration**
   ```typescript
   // config.ts
   newProvider: {
     apiKey: getEnvForService('NEW_PROVIDER_API_KEY', 'New Provider'),
     // Other configurations...
   }
   ```

3. **Create Provider Implementation**
   ```typescript
   // providers/new-provider.ts
   export async function sendSMSByNewProvider(options: SMSOptions): Promise<SMSResponse> {
     // Implement sending logic...
   }
   ```

4. **Update Types and Routing**
   ```typescript
   // types.ts
   export type SMSProvider = 'aliyun' | 'twilio' | 'newProvider';
   
   // sms-sender.ts
   case 'newProvider':
     return await sendSMSByNewProvider(options);
   ```

## ⚠️ Important Notes

- **Provider Selection**: Must explicitly specify `provider` or set `defaultProvider` in configuration
- **Aliyun**: Only supports mainland China phone numbers, uses template mechanism, supports default template from environment variables
- **Twilio**: Supports global phone numbers, but relatively higher cost
- **Number Format**: System automatically handles different formats, no manual conversion needed
- **Template Configuration**: Aliyun can set default template code in environment variables, can also override when calling
- **Environment Variables**: Make sure to properly configure all required environment variables in production
- **Configuration Getters**: Configuration uses getter functions, supports runtime environment variable retrieval
- **Error Types**: Provides detailed error types and provider information for easy debugging

## 📊 Usage Statistics

SMS service automatically logs sending information:
```
✅ Using SMS provider: aliyun for phone: +8613800138000
✅ Aliyun SMS: Formatted phone +8613800138000 to 13800138000
✅ Aliyun SMS: Using template SMS_235815655 with params: {"code":"123456"}
✅ Aliyun SMS sent successfully: 12345678901234567890
``` 