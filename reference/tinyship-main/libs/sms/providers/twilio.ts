import twilio from 'twilio';
import { SMSOptions, SMSResponse, TwilioSMSOptions } from '../types';
import { config } from '@config';

const twilioConfig = config.sms.twilio;

const client = twilio(
  twilioConfig.accountSid,
  twilioConfig.authToken
);

/**
 * 格式化手机号码用于Twilio SMS
 * Twilio需要完整的国际格式（带+前缀）
 */
function formatPhoneForTwilio(phoneNumber: string): string {
  // 如果已经有+前缀，直接返回
  if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  }
  
  // 移除所有非数字字符
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  
  // 如果是11位中国号码，自动添加+86
  if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
    return '+86' + cleanPhone;
  }
  
  // 其他情况需要明确的国际前缀
  throw new Error(`International phone number must include country code: ${phoneNumber}. Twilio requires full international format.`);
}

/**
 * 验证Twilio短信选项
 */
function validateTwilioOptions(options: SMSOptions): void {
  if (!options.message) {
    throw new Error('Twilio SMS requires message content. Please provide the SMS text to send.');
  }
  
  // templateCode和templateParams对Twilio不适用
  if (options.templateCode || options.templateParams) {
    console.warn('Twilio SMS sends message content directly. Template fields will be ignored.');
  }
}

/**
 * 使用Twilio发送短信
 */
export async function sendSMSByTwilio(options: SMSOptions): Promise<SMSResponse> {
  try {
    // 验证选项
    validateTwilioOptions(options);
    
    // 格式化手机号码
    const formattedPhone = formatPhoneForTwilio(options.to);
    
    console.log(`Twilio SMS: Formatted phone ${options.to} to ${formattedPhone}`);
    console.log(`Twilio SMS: Sending message: "${options.message}"`);
    
    const response = await client.messages.create({
      to: formattedPhone,
      from: options.from || twilioConfig.defaultFrom,
      body: options.message!,
    });

    console.log(`Twilio SMS sent successfully: ${response.sid}`);

    return {
      success: true,
      messageId: response.sid,
    };
  } catch (error) {
    console.error('Failed to send SMS via Twilio:', error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: 'TwilioSMSError',
        provider: 'twilio'
      }
    };
  }
} 