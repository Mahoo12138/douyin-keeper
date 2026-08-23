# AGENTS.md

## Overview

Unified storage abstraction layer supporting multiple cloud storage providers: Alibaba Cloud OSS, AWS S3, Cloudflare R2, and Tencent Cloud COS. Provides consistent interface for file operations with type safety, signed URL generation, and comprehensive error handling. R2 uses S3Provider under the hood as it's S3-compatible.

## Setup Commands

```bash
# Environment configuration required
# Add to .env file:

# Select default provider
STORAGE_PROVIDER=oss  # Options: oss, s3, r2, cos

# Alibaba Cloud OSS
OSS_REGION=oss-cn-shanghai
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your-bucket-name

# AWS S3
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your_access_key_id
S3_ACCESS_KEY_SECRET=your_secret_access_key
S3_BUCKET=your-bucket-name

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_ACCESS_KEY_SECRET=your_r2_access_key_secret
R2_BUCKET=your-bucket-name

# Tencent Cloud COS
COS_REGION=ap-guangzhou
COS_SECRET_ID=your_secret_id
COS_SECRET_KEY=your_secret_key
COS_BUCKET=your-bucket-name-appid  # Format: bucket-appid

# Dependencies already in root package.json
# ali-oss, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, cos-nodejs-sdk-v5
```

## Code Style

- Multi-provider design with unified `StorageProvider` interface
- Factory pattern via `createStorageProvider()` function
- Configuration split: sensitive data in env vars, defaults in `@config`
- TypeScript with comprehensive type definitions
- Async/await pattern for all storage operations
- Consistent error handling with descriptive messages
- R2 reuses S3Provider with specific endpoint configuration

## Usage Examples

### Basic File Upload

```typescript
import { storage } from '@libs/storage';

// Upload using default provider (set by STORAGE_PROVIDER env var)
const result = await storage.uploadFile({
  file: fileBuffer,
  fileName: 'document.pdf',
  contentType: 'application/pdf',
  folder: 'uploads/2024'
});

console.log('Uploaded:', result.key);
```

### Using Specific Provider

```typescript
import { createStorageProvider } from '@libs/storage';

// Create specific provider
const s3Storage = createStorageProvider('s3');
const ossStorage = createStorageProvider('oss');
const r2Storage = createStorageProvider('r2');
const cosStorage = createStorageProvider('cos');

// Upload to S3
await s3Storage.uploadFile({
  file: buffer,
  fileName: 'file.zip'
});
```

### Generate Signed URL

```typescript
import { storage } from '@libs/storage';

// Download URL (default 1 hour expiration)
const { url, expiresAt } = await storage.generateSignedUrl({
  key: 'uploads/document.pdf',
  operation: 'get',
  expiresIn: 3600
});

// Upload URL
const uploadUrl = await storage.generateSignedUrl({
  key: 'uploads/new-file.pdf',
  operation: 'put',
  contentType: 'application/pdf'
});
```

### File Operations

```typescript
import { storage } from '@libs/storage';

// Check file exists
const exists = await storage.fileExists('path/to/file.txt');

// Get metadata
const metadata = await storage.getFileMetadata('path/to/file.txt');
console.log(`Size: ${metadata.size}, Type: ${metadata.contentType}`);

// Delete file
const deleted = await storage.deleteFile('path/to/file.txt');

// List files in folder
const files = await storage.listFiles('uploads/', 100);
```

### Error Handling

```typescript
try {
  await storage.uploadFile(params);
} catch (error) {
  if (error.message.includes('InvalidAccessKeyId')) {
    console.error('Check your credentials');
  } else if (error.message.includes('NoSuchBucket')) {
    console.error('Bucket does not exist');
  }
}
```

## Common Tasks

### Provider Configuration

```typescript
// Configuration in config.ts
storage: {
  defaultProvider: 'oss', // or 's3', 'r2', 'cos'
  
  oss: {
    region: getEnv('OSS_REGION'),
    accessKeyId: requireEnv('OSS_ACCESS_KEY_ID'),
    accessKeySecret: requireEnv('OSS_ACCESS_KEY_SECRET'),
    bucket: getEnv('OSS_BUCKET'),
    endpoint: getEnv('OSS_ENDPOINT'),
    defaultExpiration: 60,
  },
  
  s3: {
    region: getEnv('S3_REGION'),
    accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
    accessKeySecret: requireEnv('S3_ACCESS_KEY_SECRET'),
    bucket: getEnv('S3_BUCKET'),
    endpoint: getEnv('S3_ENDPOINT'),
    forcePathStyle: false,
    defaultExpiration: 3600,
  },
  
  r2: {
    accountId: requireEnv('CLOUDFLARE_ACCOUNT_ID') // legacy R2_ACCOUNT_ID still supported as fallback
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    accessKeySecret: requireEnv('R2_ACCESS_KEY_SECRET'),
    bucket: getEnv('R2_BUCKET'),
    defaultExpiration: 3600,
  },
  
  cos: {
    region: getEnv('COS_REGION'),
    secretId: requireEnv('COS_SECRET_ID'),
    secretKey: requireEnv('COS_SECRET_KEY'),
    bucket: getEnv('COS_BUCKET'),
    defaultExpiration: 3600,
  }
}
```

### Add New Provider

1. Create implementation in `providers/` implementing `StorageProvider` interface
2. Add provider type to `StorageProviderType` in `index.ts`
3. Update `createStorageProvider()` factory function
4. Add configuration section in `config.ts`
5. Add environment variables to `env.example`
6. Update documentation

### S3-Compatible Services

```bash
# For MinIO, DigitalOcean Spaces, etc.
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_FORCE_PATH_STYLE=true
```

## Testing Instructions

```bash
# Run storage tests
pnpm test libs/storage

# Test specific provider
pnpm test libs/storage/providers/oss
pnpm test libs/storage/providers/s3

# Manual testing
# 1. Configure environment variables for chosen provider
# 2. Test upload, download, delete operations
# 3. Verify signed URLs work correctly
# 4. Test error handling with invalid credentials
```

## Troubleshooting

### Authentication Issues
- Verify access key and secret in environment variables
- Check IAM permissions for the access key
- Ensure bucket policy allows the operations

### OSS Specific
- Verify region matches bucket location
- Check endpoint format: `oss-cn-shanghai.aliyuncs.com`
- Ensure bucket exists and is accessible

### S3/R2 Specific
- For R2: Account ID must be correct
- For S3: Region must match bucket region
- For S3-compatible: Set `S3_FORCE_PATH_STYLE=true`

### COS Specific
- Bucket name format: `bucket-appid` (e.g., `example-1250000000`)
- Region format: `ap-xxx` (e.g., `ap-guangzhou`, `ap-shanghai`)
- Check CAM permissions for the SecretId/SecretKey
- For browser access: Configure CORS in Tencent Cloud console

### Network Issues
- Check firewall/proxy settings
- Verify endpoint URLs are reachable
- Consider timeout configurations

### CORS Issues (Browser Access)
- Configure CORS on bucket settings
- For R2: Use Cloudflare dashboard
- For S3: Use bucket CORS configuration

## Architecture Notes

- **Unified Interface**: All providers implement `StorageProvider` interface
- **Factory Pattern**: `createStorageProvider()` returns appropriate provider instance
- **R2 Implementation**: Uses `S3Provider` with R2-specific configuration (auto region, path style)
- **COS Implementation**: Uses `cos-nodejs-sdk-v5` SDK for Tencent Cloud Object Storage
- **Configuration**: Sensitive data in env vars, settings in `@config`
- **Error Handling**: Consistent error messages with provider-specific details
- **Type Safety**: Full TypeScript support with exported types
- **Monorepo Ready**: Designed for shared usage across Next.js, Nuxt.js, and TanStack Start applications
- **Extensible**: Easy to add new providers following existing patterns
