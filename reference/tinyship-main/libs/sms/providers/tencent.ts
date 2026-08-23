import * as tencentcloud from 'tencentcloud-sdk-nodejs-sms';
import { SMSOptions, SMSResponse } from '../types';
import { config } from '@config';

const tencentConfig = config.sms.tencent;

const SmsClient = tencentcloud.sms.v20210111.Client;

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

const REQUIRED_ENV_VARS =
  'TENCENT_SECRET_ID, TENCENT_SECRET_KEY, TENCENT_SMS_SDK_APP_ID, TENCENT_SMS_SIGN_NAME, and TENCENT_SMS_TEMPLATE_ID';

function createClient() {
  return new SmsClient({
    credential: {
      secretId: tencentConfig.secretId,
      secretKey: tencentConfig.secretKey,
    },
    region: tencentConfig.region,
    profile: {
      httpProfile: {
        endpoint: 'sms.tencentcloudapi.com',
      },
    },
  });
}

/**
 * Format phone number to E.164 standard required by Tencent Cloud SMS.
 * Tencent requires +[country code][number], e.g. +8613800138000
 */
function formatPhoneForTencent(phoneNumber: string): string {
  const cleanPhone = phoneNumber.replace(/\s/g, '');

  if (cleanPhone.startsWith('+')) {
    if (!E164_PATTERN.test(cleanPhone)) {
      throw new Error(
        `Invalid phone number format: ${phoneNumber}. Tencent SMS requires E.164 format (+[country code][number]).`
      );
    }
    return cleanPhone;
  }

  const digits = cleanPhone.replace(/\D/g, '');

  // 11-digit number starting with 1 → assume China mainland
  if (digits.length === 11 && digits.startsWith('1')) {
    const formatted = `+86${digits}`;
    if (!E164_PATTERN.test(formatted)) {
      throw new Error(
        `Invalid phone number format: ${phoneNumber}. Tencent SMS requires E.164 format (+[country code][number]).`
      );
    }
    return formatted;
  }

  // 13-digit number starting with 86 → already has country code
  if (digits.startsWith('86') && digits.length === 13) {
    const formatted = `+${digits}`;
    if (!E164_PATTERN.test(formatted)) {
      throw new Error(
        `Invalid phone number format: ${phoneNumber}. Tencent SMS requires E.164 format (+[country code][number]).`
      );
    }
    return formatted;
  }

  throw new Error(
    `Invalid phone number format: ${phoneNumber}. Tencent SMS requires E.164 format (+[country code][number]).`
  );
}

/**
 * Convert template parameters to ordered TemplateParamSet values.
 * Tencent uses positional placeholders {1}, {2}, etc.
 * Prefer templateParamSet for explicit ordering; otherwise use numeric keys or a single OTP key.
 */
function buildTemplateParamSet(
  templateParams?: Record<string, string>,
  templateParamSet?: string[]
): string[] {
  if (templateParamSet?.length) {
    return templateParamSet;
  }

  if (!templateParams) {
    return [];
  }

  const keys = Object.keys(templateParams);
  if (keys.length === 0) {
    return [];
  }

  if (keys.length === 1) {
    return [templateParams[keys[0]!]!];
  }

  const allNumericKeys = keys.every((key) => /^\d+$/.test(key));
  if (!allNumericKeys) {
    throw new Error(
      'Tencent SMS multi-parameter templates require numeric keys ("1", "2", ...). Use a single key for OTP templates.'
    );
  }

  return keys
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => templateParams[key]!);
}

/**
 * Send SMS via Tencent Cloud SMS service
 */
export async function sendSMSByTencent(options: SMSOptions): Promise<SMSResponse> {
  try {
    if (options.message) {
      console.warn('Tencent SMS uses template mechanism. The message field will be ignored.');
    }

    const smsSdkAppId = tencentConfig.smsSdkAppId;
    const signName = tencentConfig.signName;
    const templateId = options.templateCode || tencentConfig.templateId;
    const secretId = tencentConfig.secretId;
    const secretKey = tencentConfig.secretKey;

    if (!secretId || !secretKey || !smsSdkAppId || !signName || !templateId) {
      return {
        success: false,
        error: {
          message: `Tencent SMS is not properly configured. Check ${REQUIRED_ENV_VARS}.`,
          name: 'TencentSMSError',
          provider: 'tencent',
        },
      };
    }

    const formattedPhone = formatPhoneForTencent(options.to);
    const templateParams = buildTemplateParamSet(options.templateParams, options.templateParamSet);

    console.log(`Tencent SMS: Sending to ${formattedPhone} with template ${templateId}`);

    const client = createClient();

    const params = {
      SmsSdkAppId: smsSdkAppId,
      SignName: signName,
      PhoneNumberSet: [formattedPhone],
      TemplateId: templateId,
      TemplateParamSet: templateParams,
    };

    const response = await client.SendSms(params);

    if (!response.SendStatusSet || response.SendStatusSet.length === 0) {
      return {
        success: false,
        requestId: response.RequestId || '',
        error: {
          message: 'Empty response from Tencent SMS service',
          name: 'TencentSMSError',
          provider: 'tencent',
        },
      };
    }

    const status = response.SendStatusSet[0];

    if (status.Code !== 'Ok') {
      return {
        success: false,
        requestId: response.RequestId || '',
        error: {
          message: status.Message || `Tencent SMS error: ${status.Code}`,
          name: 'TencentSMSError',
          provider: 'tencent',
        },
      };
    }

    console.log(`Tencent SMS sent successfully: ${status.SerialNo}`);

    return {
      success: true,
      messageId: status.SerialNo || '',
      requestId: response.RequestId || '',
    };
  } catch (error) {
    console.error('Failed to send SMS via Tencent:', error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: 'TencentSMSError',
        provider: 'tencent',
      },
    };
  }
}
