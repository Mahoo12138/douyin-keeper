/**
 * Utility functions for credits library
 */

/**
 * Safely parse a number value, returning 0 if invalid (undefined, NaN, null)
 * @param value - The value to parse
 * @param defaultValue - Default value if parsing fails (default: 0)
 */
export function safeNumber(value: unknown, defaultValue = 0): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  return defaultValue;
}

/**
 * Transaction type codes for database storage
 * These codes are language-agnostic and can be used for i18n at display time
 */
export const TransactionTypeCode = {
  AI_CHAT: 'ai_chat',
  AI_IMAGE_GENERATION: 'ai_image_generation',
  AI_VIDEO_GENERATION: 'ai_video_generation',
  IMAGE_GENERATION: 'image_generation',
  DOCUMENT_PROCESSING: 'document_processing',
  PURCHASE: 'purchase',
  BONUS: 'bonus',
  REFUND: 'refund',
  ADJUSTMENT: 'adjustment',
  REFERRAL_SIGNUP_BONUS: 'referral_signup_bonus',
  REFERRAL_REFERRER_BONUS: 'referral_referrer_bonus',
} as const;

export type TransactionTypeCode = typeof TransactionTypeCode[keyof typeof TransactionTypeCode];

