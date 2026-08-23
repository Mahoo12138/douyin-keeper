/**
 * 邮件服务提供商类型
 */
export type EmailProvider = 'resend' | 'cloudflare' | 'sendgrid' | 'mailchimp' | 'smtp';

/**
 * 统一的邮件发送选项接口
 */
export interface EmailOptions {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  provider?: EmailProvider;
}

/**
 * 统一的邮件发送响应接口
 */
export interface EmailResponse {
  success: boolean;
  id?: string;
  error?: {
    message: string;
    name: string;
    provider?: EmailProvider;
  } | null;
} 
