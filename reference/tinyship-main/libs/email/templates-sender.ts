import { sendEmailByResend } from './providers/resend';
import { sendEmailByCloudflare } from './providers/cloudflare';
import { templates, VerificationEmailParams, ResetPasswordEmailParams, EmailTemplate } from './templates/index';
import { EmailProvider, EmailResponse, EmailOptions } from './types';
import { config } from '@config';

/**
 * 默认发件人邮箱
 */
const DEFAULT_FROM = config.email.defaultFrom || 'noreply@tinyship.co';

/**
 * 基础发送邮件配置，扩展自EmailOptions
 */
export interface SendEmailOptions extends Omit<EmailOptions, 'to' | 'from' | 'subject' | 'html'> {
  to: string;
  from?: string;
  subject: string;
  html: string;
  provider?: EmailProvider;
}

/**
 * 根据提供商发送邮件
 */
async function sendEmail(options: SendEmailOptions): Promise<EmailResponse> {
  const { provider = config.email.defaultProvider, ...emailOptions } = options;
  
  // 确保有from属性
  if (!emailOptions.from) {
    emailOptions.from = DEFAULT_FROM;
  }
  
  // 根据不同提供商选择不同的发送方法
  switch (provider) {
    case 'resend': {
      // 为Resend构建参数
      const resendOptions: EmailOptions = {
        to: emailOptions.to,
        from: emailOptions.from,
        subject: emailOptions.subject,
        html: emailOptions.html
      };
      
      // 复制其他属性
      if (emailOptions.cc) resendOptions.cc = emailOptions.cc;
      if (emailOptions.bcc) resendOptions.bcc = emailOptions.bcc;
      if (emailOptions.replyTo) resendOptions.replyTo = emailOptions.replyTo;
      if (emailOptions.text) resendOptions.text = emailOptions.text;
      
      const response = await sendEmailByResend(resendOptions);
      return response;
    }

    case 'cloudflare': {
      const cloudflareOptions: EmailOptions = {
        to: emailOptions.to,
        from: emailOptions.from,
        subject: emailOptions.subject,
        html: emailOptions.html
      };

      if (emailOptions.cc) cloudflareOptions.cc = emailOptions.cc;
      if (emailOptions.bcc) cloudflareOptions.bcc = emailOptions.bcc;
      if (emailOptions.replyTo) cloudflareOptions.replyTo = emailOptions.replyTo;
      if (emailOptions.text) cloudflareOptions.text = emailOptions.text;

      const response = await sendEmailByCloudflare(cloudflareOptions);
      return response;
    }
      
    case 'sendgrid':
      // 待实现
      // return sendEmailBySendgrid(emailOptions);
      throw new Error('SendGrid provider not implemented yet');
      
    case 'mailchimp':
      // 待实现
      // return sendEmailByMailchimp(emailOptions);
      throw new Error('Mailchimp provider not implemented yet');
      
    case 'smtp':
      // 待实现
      // return sendEmailBySmtp(emailOptions);
      throw new Error('SMTP provider not implemented yet');
      
    default:
      throw new Error(`Unsupported email provider: ${provider}`);
  }
}

/**
 * 发送验证邮件
 * @param to 收件人邮箱
 * @param params 验证邮件所需参数
 * @param options 邮件发送配置
 * @returns 邮件发送结果
 */
export async function sendVerificationEmail(
  to: string, 
  params: VerificationEmailParams,
  options: Omit<SendEmailOptions, 'to' | 'subject' | 'html'> = {}
): Promise<EmailResponse> {
  const { subject, html } = templates.verification(params);
  
  return sendEmail({
    to,
    subject,
    html,
    ...options
  });
}

/**
 * 发送重置密码邮件
 * @param to 收件人邮箱
 * @param params 重置密码邮件所需参数
 * @param options 邮件发送配置
 * @returns 邮件发送结果
 */
export async function sendResetPasswordEmail(
  to: string, 
  params: ResetPasswordEmailParams,
  options: Omit<SendEmailOptions, 'to' | 'subject' | 'html'> = {}
): Promise<EmailResponse> {
  const { subject, html } = templates.resetPassword(params);
  
  return sendEmail({
    to,
    subject,
    html,
    ...options
  });
}

/**
 * 发送任意模板邮件的通用函数
 * @param to 收件人邮箱
 * @param template 邮件模板
 * @param options 邮件发送配置
 * @returns 邮件发送结果
 */
export async function sendTemplateEmail(
  to: string, 
  template: EmailTemplate,
  options: Omit<SendEmailOptions, 'to' | 'subject' | 'html'> = {}
): Promise<EmailResponse> {
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    ...options
  });
} 
