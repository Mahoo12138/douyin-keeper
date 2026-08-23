/**
 * Application Configuration
 * 
 * This is the main configuration file.
 * - App configuration is defined here
 * - Other configurations are imported from config/ folder
 */

import { requireEnvForService } from './config/utils';
import { authConfig } from './config/auth';
import { paymentConfig } from './config/payment';
import { creditsConfig } from './config/credits';
import { smsConfig } from './config/sms';
import { emailConfig } from './config/email';
import { captchaConfig } from './config/captcha';
import { databaseConfig } from './config/database';
import { storageConfig } from './config/storage';
import { aiConfig } from './config/ai';
import { aiImageConfig } from './config/aiImage';
import { aiVideoConfig } from './config/aiVideo';
import { affiliateConfig } from './config/affiliate';

// Re-export types for backwards compatibility
export type { RecurringPlan, OneTimePlan, CreditPlan, Plan } from './config/types';

/**
 * Application Configuration
 */
export const config = {
  /**
   * Application Configuration
   */
  app: {
    /**
     * Application Name
     * This will be used throughout the application for branding
     */
    name: 'TinyShip',

    /**
     * Logo Configuration
     * Customize your application's logo appearance
     */
    logo: {
      /**
       * Logo icon URL (path relative to public folder or absolute URL)
       * Recommended size: 40x40px for square icon
       * @example '/logo.svg' or 'https://example.com/logo.png'
       */
      iconUrl: '/logo.svg',

      /**
       * Full logo image URL (optional, includes icon and text)
       * Used for scenarios where you want a complete logo image instead of icon + text
       * If not provided, icon + app name text will be used
       * Recommended size: 200x40px
       */
      fullLogoUrl: '' as string | undefined,

      /**
       * Custom CSS classes for the icon container
       * Use this to add background color, border, rounded corners, padding, etc.
       * @example 'bg-primary rounded-full p-1' or 'bg-white shadow-sm rounded-lg'
       */
      iconClassName: 'bg-chart-1 rounded-full p-2' as string,
    },

    /**
     * Base URL Configuration
     * This will be used for all callback URLs and webhooks
     */
    get baseUrl() {
      return requireEnvForService('APP_BASE_URL', 'Application', 'http://localhost:7001');
    },

    /**
     * Theme Configuration
     * Default theme and color scheme for the application
     */
    theme: {
      /**
       * Default theme mode
       * @type {'light' | 'dark'}
       */
      defaultTheme: 'light' as const,

      /**
       * Default color scheme
       * @type {'default' | 'claude' | 'cosmic-night' | 'modern-minimal' | 'ocean-breeze'}
       */
      defaultColorScheme: 'claude' as const,

      /**
       * Storage key for theme persistence
       */
      storageKey: 'tinyship-ui-theme'
    },

    /**
     * Internationalization Configuration
     * Default language and locale settings
     */
    i18n: {
      /**
       * Default locale
       * @type {'en' | 'zh-CN'}
       */
      defaultLocale: 'zh-CN' as const,
      /**
       * Available locales
       */
      locales: ['en', 'zh-CN'] as const,
      /**
       * Cookie key for locale persistence
       * Used by both Next.js middleware and Nuxt.js i18n module
       */
      cookieKey: 'NEXT_LOCALE',

      /**
       * Auto-detect browser language
       * When true, detects user's browser language preference
       * When false, always uses defaultLocale for new users
       * Cookie preferences always take priority when set
       */
      autoDetect: false
    },

    /**
     * Payment Related URLs
     */
    payment: {
      /**
       * Payment Success/Cancel URLs
       * These URLs will be used by payment providers for redirects
       * The locale middleware will automatically add locale prefix
       */
      get successUrl() {
        return `${config.app.baseUrl}/payment-success`;
      },
      get cancelUrl() {
        return `${config.app.baseUrl}/payment-cancel`;
      },
    }
  },

  // Configurations from config/ folder
  auth: authConfig,
  payment: paymentConfig,
  credits: creditsConfig,
  sms: smsConfig,
  email: emailConfig,
  captcha: captchaConfig,
  database: databaseConfig,
  storage: storageConfig,
  ai: aiConfig,
  aiImage: aiImageConfig,
  aiVideo: aiVideoConfig,
  affiliate: affiliateConfig,
} as const;
