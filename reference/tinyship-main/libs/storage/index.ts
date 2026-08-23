import { config } from '@config';
import { OSSProvider } from './providers/oss';
import { S3Provider, createR2Provider } from './providers/s3';
import { COSProvider } from './providers/cos';
import type { StorageProvider } from './types';

export type StorageProviderType = 'oss' | 's3' | 'r2' | 'cos';

/**
 * Create storage provider instance
 * @param provider Storage provider type
 * @returns Storage provider instance
 */
export function createStorageProvider<T extends StorageProviderType>(
  provider: T
): StorageProvider {
  switch (provider) {
    case 'oss':
      return new OSSProvider();
    case 's3':
      return new S3Provider();
    case 'r2':
      return createR2Provider();
    case 'cos':
      return new COSProvider();
    default:
      throw new Error(`Unsupported storage provider: ${provider}`);
  }
}

// Export types and provider implementations for convenience
export * from './types';
export { OSSProvider };
export { S3Provider, createR2Provider };
export { COSProvider, type COSProviderConfig } from './providers/cos';

// Default storage instance for easy usage
// Uses the defaultProvider from config, which can be set via STORAGE_PROVIDER env var
export const storage = createStorageProvider(config.storage.defaultProvider);
