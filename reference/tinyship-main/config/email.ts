/**
 * Email Service Configuration
 */
import { getEnvForService } from './utils';

export const emailConfig = {
  /**
   * Default Email Provider
   */
  defaultProvider: 'resend',

  /**
   * Default Sender Email
   */
  get defaultFrom() {
    return getEnvForService('EMAIL_DEFAULT_FROM', 'Email Service');
  },

  /**
   * Resend Configuration
   */
  resend: {
    // Optional service, using warning instead of error
    get apiKey() {
      return getEnvForService('RESEND_API_KEY', 'Resend Email');
    }
  },

  /**
   * Cloudflare Email Sending Configuration
   * Reuses shared Cloudflare account credentials.
   */
  cloudflare: {
    get accountId() {
      return getEnvForService('CLOUDFLARE_ACCOUNT_ID', 'Cloudflare Email');
    },
    get apiToken() {
      return getEnvForService('CLOUDFLARE_API_TOKEN', 'Cloudflare Email');
    }
  },
} as const;
