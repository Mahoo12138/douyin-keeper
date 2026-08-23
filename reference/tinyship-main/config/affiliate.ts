/**
 * Affiliate/Referral System Configuration
 * Enables users to earn commissions by referring new customers.
 * Set AFFILIATE_ENABLED=true to enable the system. It is disabled by default.
 */

import { getEnv } from './utils';

export const affiliateConfig = {
  get enabled() {
    return getEnv('AFFILIATE_ENABLED') === 'true';
  },

  /**
   * Commission rate as a decimal (e.g. 0.20 = 20%)
   * Applied to order amount on every purchase by referred users
   */
  get commissionRate() {
    const rate = getEnv('AFFILIATE_COMMISSION_RATE');
    if (rate) {
      const parsed = parseFloat(rate);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
    return 0.20;
  },

  /**
   * Fixed commission amount override (for testing or flat-fee models).
   * When > 0, overrides percentage-based commission.
   */
  get fixedCommissionAmount() {
    const amount = getEnv('AFFILIATE_FIXED_COMMISSION_AMOUNT');
    if (amount) {
      const parsed = parseFloat(amount);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 0;
  },

  cookie: {
    name: 'referral_code',

    get expiryDays() {
      const days = getEnv('AFFILIATE_COOKIE_EXPIRY_DAYS');
      if (days) {
        const parsed = parseInt(days, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
      return 30;
    },
  },

  referral: {
    paramName: 'ref',
  },

  /**
   * Commission currency code (ISO 4217).
   * All plans participating in the affiliate program MUST use this same currency.
   * Multi-currency commission balances are NOT supported — mixing currencies
   * will produce incorrect totals.
   */
  get currency() {
    return getEnv('AFFILIATE_CURRENCY') || 'USD';
  },

  get minWithdrawalAmount() {
    const amount = getEnv('AFFILIATE_MIN_WITHDRAWAL');
    if (amount) {
      const parsed = parseFloat(amount);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return 100;
  },

  /** Bonus credits granted to the referrer when a new user signs up via their link */
  get referrerSignupBonus() {
    const amount = getEnv('AFFILIATE_REFERRER_SIGNUP_BONUS');
    if (amount) {
      const parsed = parseFloat(amount);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return 10;
  },

  /** Bonus credits granted to the new user (referee) who signed up via a referral link */
  get refereeSignupBonus() {
    const amount = getEnv('AFFILIATE_REFEREE_SIGNUP_BONUS');
    if (amount) {
      const parsed = parseFloat(amount);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return 10;
  },
} as const;
