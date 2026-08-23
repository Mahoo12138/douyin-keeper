/**
 * Storage Configuration
 */
import { getEnv, getEnvForService, requireEnvForService, requireEnvWithFallback } from './utils';

export const storageConfig = {
  /**
   * Default Storage Provider
   * @type {'oss' | 's3' | 'r2' | 'cos'}
   */
  get defaultProvider() {
    const provider = getEnv('STORAGE_PROVIDER');
    if (provider && ['oss', 's3', 'r2', 'cos'].includes(provider)) {
      return provider as 'oss' | 's3' | 'r2' | 'cos';
    }
    return 'oss' as const;
  },

  /**
   * Alibaba Cloud OSS Configuration
   * Note: OSS can reuse ALIYUN_ACCESS_KEY_ID/SECRET if OSS_ACCESS_KEY_ID/SECRET are not set
   */
  oss: {
    get region() {
      return getEnv('OSS_REGION') || 'oss-cn-shanghai';
    },
    get accessKeyId() {
      // Fallback to ALIYUN_ACCESS_KEY_ID if OSS_ACCESS_KEY_ID is not set
      return requireEnvWithFallback(['OSS_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_ID'], 'Alibaba Cloud OSS');
    },
    get accessKeySecret() {
      // Fallback to ALIYUN_ACCESS_KEY_SECRET if OSS_ACCESS_KEY_SECRET is not set
      return requireEnvWithFallback(['OSS_ACCESS_KEY_SECRET', 'ALIYUN_ACCESS_KEY_SECRET'], 'Alibaba Cloud OSS');
    },
    get bucket() {
      return getEnv('OSS_BUCKET') || 'tinyship';
    },
    get endpoint() {
      return getEnv('OSS_ENDPOINT') || 'oss-cn-shanghai.aliyuncs.com';
    },
    defaultExpiration: 60, // 1 minute in seconds
  },

  /**
   * AWS S3 Configuration
   */
  s3: {
    get region() {
      return getEnv('S3_REGION') || 'us-east-1';
    },
    get accessKeyId() {
      return requireEnvForService('S3_ACCESS_KEY_ID', 'AWS S3');
    },
    get accessKeySecret() {
      return requireEnvForService('S3_ACCESS_KEY_SECRET', 'AWS S3');
    },
    get bucket() {
      return getEnv('S3_BUCKET') || 'tinyship';
    },
    get endpoint() {
      return getEnvForService('S3_ENDPOINT', 'AWS S3');
    },
    get forcePathStyle() {
      return getEnv('S3_FORCE_PATH_STYLE') === 'true';
    },
    defaultExpiration: 3600, // 1 hour in seconds
  },

  /**
   * Cloudflare R2 Configuration
   * R2 is S3-compatible, uses S3Provider under the hood
   */
  r2: {
    get accountId() {
      // Backward-compatible fallback: reuse the shared Cloudflare account ID
      // when a dedicated R2_ACCOUNT_ID is not provided.
      return requireEnvWithFallback(['R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID'], 'Cloudflare R2');
    },
    get accessKeyId() {
      return requireEnvForService('R2_ACCESS_KEY_ID', 'Cloudflare R2');
    },
    get accessKeySecret() {
      return requireEnvForService('R2_ACCESS_KEY_SECRET', 'Cloudflare R2');
    },
    get bucket() {
      return getEnv('R2_BUCKET') || 'tinyship';
    },
    /** Public custom domain for the R2 bucket (e.g. https://cdn.example.com) */
    get publicUrl() {
      return getEnv('R2_PUBLIC_URL') || '';
    },
    defaultExpiration: 3600, // 1 hour in seconds
  },

  /**
   * Tencent Cloud COS Configuration
   */
  cos: {
    get secretId() {
      // Fallback to TENCENT_SECRET_ID if COS_SECRET_ID is not set
      return requireEnvWithFallback(['COS_SECRET_ID', 'TENCENT_SECRET_ID'], 'Tencent Cloud COS');
    },
    get secretKey() {
      // Fallback to TENCENT_SECRET_KEY if COS_SECRET_KEY is not set
      return requireEnvWithFallback(['COS_SECRET_KEY', 'TENCENT_SECRET_KEY'], 'Tencent Cloud COS');
    },
    get bucket() {
      // COS bucket name format: bucket-appid (e.g., example-1250000000)
      return getEnv('COS_BUCKET') || 'tinyship-1250000000';
    },
    get region() {
      // COS region format: ap-xxx (e.g., ap-guangzhou, ap-shanghai, ap-beijing)
      return getEnv('COS_REGION') || 'ap-guangzhou';
    },
    defaultExpiration: 3600, // 1 hour in seconds
  }
} as const;
