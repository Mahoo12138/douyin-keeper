// Export types directly to avoid webpack module resolution issues
export type { EmailProvider, EmailOptions, EmailResponse } from './types';
export { sendEmailByResend } from './providers/resend';
export { sendEmailByCloudflare } from './providers/cloudflare';
export { sendEmail } from './email-sender';
export * from './templates';
export * from './templates-sender';
