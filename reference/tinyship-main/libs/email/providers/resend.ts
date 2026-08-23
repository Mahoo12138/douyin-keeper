import { Resend } from 'resend';
import { EmailOptions, EmailResponse } from '../types';
import { config } from '@config';

let resendInstance: Resend | null = null;

function getResendInstance(): Resend {
  if (!resendInstance) {
    resendInstance = new Resend(config.email.resend.apiKey);
  }
  return resendInstance;
}

/**
 * 使用Resend发送邮件
 */
export async function sendEmailByResend(options: EmailOptions): Promise<EmailResponse> {
  try {
    const resend = getResendInstance();
    const { data: responseData, error } = await resend.emails.send({
      from: options.from || config.email.defaultFrom!,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo,
    });

    if (error) {
      return {
        success: false,
        error: {
          message: error.message,
          name: 'ResendError',
          provider: 'resend'
        }
      };
    }

    return {
      success: true,
      id: responseData?.id,
    };
  } catch (error) {
    console.error('Failed to send email:', error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: 'ResendError',
        provider: 'resend'
      }
    };
  }
}
