import { SMSOptions, SMSResponse } from './types';
import { sendSMSByAliyun } from './providers/aliyun';
import { sendSMSByTwilio } from './providers/twilio';
import { sendSMSByTencent } from './providers/tencent';
import { config } from '@config';

/**
 * 发送短信的统一接口
 */
export async function sendSMS(options: SMSOptions): Promise<SMSResponse> {
  try {
    // 要求用户明确指定服务提供商
    const provider = options.provider || config.sms.defaultProvider as 'aliyun' | 'twilio' | 'tencent';
    
    if (!provider) {
      return {
        success: false,
        error: {
          message: 'SMS provider must be specified. Please provide "aliyun" or "twilio" in the provider field.',
          name: 'MissingProvider',
        }
      };
    }
    
    console.log(`Using SMS provider: ${provider} for phone: ${options.to}`);

    switch (provider) {
      case 'aliyun':
        return await sendSMSByAliyun(options);

      case 'twilio':
        return await sendSMSByTwilio(options);

      case 'tencent':
        return await sendSMSByTencent(options);

      default:
        return {
          success: false,
          error: {
            message: `Unsupported SMS provider: ${provider}. Supported providers: aliyun, twilio, tencent`,
            name: 'UnsupportedProvider',
          }
        };
    }
  } catch (error) {
    console.error('SMS sending failed:', error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        name: 'SMSSendingError',
      }
    };
  }
} 