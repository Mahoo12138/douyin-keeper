import * as $Dysmsapi20170525 from '@alicloud/dysmsapi20170525';
import Dysmsapi20170525_Module from '@alicloud/dysmsapi20170525';
import * as $OpenApi from '@alicloud/openapi-client';
import * as $Util from '@alicloud/tea-util';
import { SMSOptions, SMSResponse, AliyunSMSOptions } from '../types';
import { config } from '@config';

const aliyunConfig = config.sms.aliyun;

// @ts-ignore
// https://github.com/aliyun/alibabacloud-typescript-sdk/issues/30
const Client = (Dysmsapi20170525_Module).default || Dysmsapi20170525_Module

const client = new Client(new $OpenApi.Config({
  accessKeyId: aliyunConfig.accessKeyId,
  accessKeySecret: aliyunConfig.accessKeySecret,
  endpoint: aliyunConfig.endpoint,
}));

const runtime = new $Util.RuntimeOptions({});

/**
 * 格式化手机号码用于阿里云SMS
 * 阿里云只支持中国大陆手机号，需要移除+86前缀
 */
function formatPhoneForAliyun(phoneNumber: string): string {
  // 移除所有非数字字符
  let cleanPhone = phoneNumber.replace(/\D/g, '');
  
  // 如果是带+86前缀的号码，移除86前缀
  if (cleanPhone.startsWith('86') && cleanPhone.length === 13) {
    cleanPhone = cleanPhone.substring(2);
  }
  
  // 验证是否为有效的中国大陆手机号（11位且以1开头）
  if (cleanPhone.length !== 11 || !cleanPhone.startsWith('1')) {
    throw new Error(`Invalid China mainland phone number: ${phoneNumber}. Aliyun SMS only supports China mainland phone numbers.`);
  }
  
  return cleanPhone;
}

/**
 * 验证阿里云短信选项
 */
function validateAliyunOptions(options: SMSOptions): void {  
  // message字段对阿里云不是必需的，因为使用模板机制
  if (options.message) {
    console.warn('Aliyun SMS uses template mechanism. The message field will be ignored.');
  }
}

/**
 * 使用阿里云发送短信
 */
export async function sendSMSByAliyun(options: SMSOptions): Promise<SMSResponse> {
  try {
    // 验证选项
    validateAliyunOptions(options);
    
    // 格式化手机号码
    const formattedPhone = formatPhoneForAliyun(options.to);
    
    console.log(`Aliyun SMS: Formatted phone ${options.to} to ${formattedPhone}`);
    console.log(`Aliyun SMS: Using template ${options.templateCode} with params:`, options.templateParams);
    
    const sendSmsRequest = new $Dysmsapi20170525.SendSmsRequest({
      phoneNumbers: formattedPhone,
      signName: aliyunConfig.signName,
      templateCode: options.templateCode! || aliyunConfig.templateCode,
      templateParam: options.templateParams ? JSON.stringify(options.templateParams) : undefined,
    });

    const response = await client.sendSmsWithOptions(sendSmsRequest, runtime);

    if (!response.body) {
      throw new Error('Empty response from Aliyun SMS service');
    }

    if (response.body.code !== 'OK') {
      return {
        success: false,
        requestId: response.body.requestId || '',
        error: {
          message: response.body.message || 'Unknown error from Aliyun SMS',
          name: 'AliyunSMSError',
          provider: 'aliyun'
        }
      };
    }

    console.log(`Aliyun SMS sent successfully: ${response.body.bizId}`);

    return {
      success: true,
      messageId: response.body.bizId || '',
      requestId: response.body.requestId || '',
    };
  } catch (error) {
    console.error('Failed to send SMS via Aliyun:', error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: 'AliyunSMSError',
        provider: 'aliyun'
      }
    };
  }
} 