/**
 * Configuration Module
 * 
 * This module re-exports all configuration from separate files.
 * Main config is exported from config.ts (root level).
 * 
 * For direct access to individual configs:
 *   import { authConfig, paymentConfig } from './config';
 */

// Re-export types
export type { RecurringPlan, OneTimePlan, CreditPlan, Plan } from './types';

// Re-export utility functions
export { getEnv, getEnvForService, requireEnvForService, requireEnvWithFallback } from './utils';

// Re-export individual configs for direct access
export { authConfig } from './auth';
export { paymentConfig } from './payment';
export { creditsConfig, resolveFixedConsumption, type FixedConsumptionConfig } from './credits';
export { smsConfig } from './sms';
export { emailConfig } from './email';
export { captchaConfig } from './captcha';
export { databaseConfig } from './database';
export { storageConfig } from './storage';
export { aiConfig } from './ai';
export { aiImageConfig } from './aiImage';
export { aiVideoConfig } from './aiVideo';
export { affiliateConfig } from './affiliate';