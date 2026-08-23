/**
 * Authentication Service Configuration
 */
import { getEnvForService } from './utils';

export const authConfig = {
  requireEmailVerification: false,

  /**
   * Social Login Providers Configuration
   */
  socialProviders: {
    /**
     * Google OAuth Configuration
     */
    google: {
      get clientId() {
        return getEnvForService('GOOGLE_CLIENT_ID', 'Google Auth');
      },
      get clientSecret() {
        return getEnvForService('GOOGLE_CLIENT_SECRET', 'Google Auth');
      }
    },

    /**
     * GitHub OAuth Configuration
     */
    github: {
      get clientId() {
        return getEnvForService('GITHUB_CLIENT_ID', 'GitHub Auth');
      },
      get clientSecret() {
        return getEnvForService('GITHUB_CLIENT_SECRET', 'GitHub Auth');
      }
    },

    /**
     * WeChat OAuth Configuration
     */
    wechat: {
      get appId() {
        return getEnvForService('NEXT_PUBLIC_WECHAT_APP_ID', 'WeChat Auth');
      },
      get appSecret() {
        return getEnvForService('WECHAT_APP_SECRET', 'WeChat Auth');
      }
    }
  }
} as const;
