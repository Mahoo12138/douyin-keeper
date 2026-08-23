/**
 * Captcha Service Configuration
 */
import { getEnvForService } from './utils';

function getVitePublicEnv(key: string): string | undefined {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return viteEnv?.[key];
}

export const captchaConfig = {
  /**
   * Enable/Disable Captcha Verification
   */
  enabled: false,

  /**
   * Default Captcha Provider
   */
  defaultProvider: 'cloudflare-turnstile',

  /**
   * Cloudflare Turnstile Configuration
   */
  cloudflare: {
    // Server-side secret key (for better-auth)
    get secretKey() {
      // Development environment fallback to test key
      if (process.env.NODE_ENV === 'development') {
        return '1x0000000000000000000000000000000AA'; // Test siteKey
      }
      return getEnvForService('TURNSTILE_SECRET_KEY', 'Cloudflare Turnstile');
    },
    // Client-side site key (uses NEXT_PUBLIC_ prefix)
    get siteKey() {
      // Development environment fallback to test key
      if (process.env.NODE_ENV === 'development') {
        return '1x00000000000000000000AA'; // Test siteKey
      }
      // Vite exposes only VITE_-prefixed values to TanStack's client bundle.
      const publicKey = getVitePublicEnv('VITE_TURNSTILE_SITE_KEY') || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
      if (publicKey) return publicKey;

      // Production requires configuration
      return getEnvForService('TURNSTILE_SITE_KEY', 'Cloudflare Turnstile');
    }
  }
} as const;
