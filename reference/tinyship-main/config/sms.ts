/**
 * SMS Service Configuration
 */
import { getEnv, getEnvForService } from './utils';

export const smsConfig = {
  /**
   * Default SMS Provider
   */
  defaultProvider: 'aliyun',

  /**
   * Aliyun SMS Configuration
   */
  aliyun: {
    // Optional service, using warning instead of error
    get accessKeyId() {
      return getEnvForService('ALIYUN_ACCESS_KEY_ID', 'Aliyun SMS');
    },
    get accessKeySecret() {
      return getEnvForService('ALIYUN_ACCESS_KEY_SECRET', 'Aliyun SMS');
    },
    get endpoint() {
      return getEnv('ALIYUN_SMS_ENDPOINT') || 'dysmsapi.aliyuncs.com';
    },
    get signName() {
      return getEnvForService('ALIYUN_SMS_SIGN_NAME', 'Aliyun SMS');
    },
    get templateCode() {
      return getEnvForService('ALIYUN_SMS_TEMPLATE_CODE', 'Aliyun SMS');
    },
  },

  /**
   * Twilio SMS Configuration
   */
  twilio: {
    // Optional service, using warning instead of error
    get accountSid() {
      return getEnvForService('TWILIO_ACCOUNT_SID', 'Twilio SMS');
    },
    get authToken() {
      return getEnvForService('TWILIO_AUTH_TOKEN', 'Twilio SMS');
    },
    get defaultFrom() {
      return getEnvForService('TWILIO_DEFAULT_FROM', 'Twilio SMS');
    },
  },

  /**
   * Tencent Cloud SMS Configuration
   * Credentials reuse shared TENCENT_SECRET_ID / TENCENT_SECRET_KEY
   */
  tencent: {
    get secretId() {
      return getEnvForService('TENCENT_SECRET_ID', 'Tencent SMS');
    },
    get secretKey() {
      return getEnvForService('TENCENT_SECRET_KEY', 'Tencent SMS');
    },
    get smsSdkAppId() {
      return getEnvForService('TENCENT_SMS_SDK_APP_ID', 'Tencent SMS');
    },
    get signName() {
      return getEnvForService('TENCENT_SMS_SIGN_NAME', 'Tencent SMS');
    },
    get templateId() {
      return getEnvForService('TENCENT_SMS_TEMPLATE_ID', 'Tencent SMS');
    },
    get region() {
      return getEnv('TENCENT_SMS_REGION') || 'ap-guangzhou';
    },
  },
} as const;
