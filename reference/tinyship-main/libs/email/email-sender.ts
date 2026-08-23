import { EmailOptions, EmailResponse } from './types';
import { sendEmailByResend } from './providers/resend';
import { sendEmailByCloudflare } from './providers/cloudflare';
import { config } from '@config';

/**
 * 发送邮件的统一接口
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResponse> {
  const provider = options.provider || config.email.defaultProvider;

  switch (provider) {
    case 'resend':
      return sendEmailByResend(options);

    case 'cloudflare':
      return sendEmailByCloudflare(options);

    case 'sendgrid':
      // 待实现
      return {
        success: false,
        error: {
          message: 'SendGrid provider not implemented yet',
          name: 'UnsupportedProvider',
          provider: 'sendgrid'
        }
      };

    case 'smtp':
      // 待实现
      return {
        success: false,
        error: {
          message: 'SMTP provider not implemented yet',
          name: 'UnsupportedProvider',
          provider: 'smtp'
        }
      };

    default:
      return {
        success: false,
        error: {
          message: `Unsupported email provider: ${provider}`,
          name: 'UnsupportedProvider',
        }
      };
  }
} 
