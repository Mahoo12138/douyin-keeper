# Storage Library

A unified storage abstraction layer for TinyShip project, providing consistent interfaces for different cloud storage providers.

## Overview

The storage library provides a unified interface for file operations across different cloud storage providers. Currently supports Alibaba Cloud OSS, AWS S3, and Cloudflare R2.

## Features

- **Unified Interface**: Consistent API across different storage providers
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Flexible Configuration**: Environment-based configuration with sensible defaults
- **Secure Access**: Signed URL generation with configurable expiration
- **Error Handling**: Comprehensive error handling with detailed error messages
- **Metadata Support**: File metadata management and retrieval
- **Multi-Provider Support**: Easy switching between OSS, S3, and R2

## Supported Providers

### Alibaba Cloud OSS
- ✅ File upload/download
- ✅ Signed URL generation
- ✅ File deletion
- ✅ File existence checking
- ✅ Metadata retrieval
- ✅ Directory listing

### AWS S3
- ✅ File upload/download
- ✅ Signed URL generation
- ✅ File deletion
- ✅ File existence checking
- ✅ Metadata retrieval
- ✅ Directory listing

### Cloudflare R2
- ✅ File upload/download
- ✅ Signed URL generation
- ✅ File deletion
- ✅ File existence checking
- ✅ Metadata retrieval
- ✅ Directory listing

### Tencent Cloud COS
- ✅ File upload/download
- ✅ Signed URL generation
- ✅ File deletion
- ✅ File existence checking
- ✅ Metadata retrieval
- ✅ Directory listing

### Planned Providers
- 🚧 Google Cloud Storage
- 🚧 Azure Blob Storage

## Installation

The library uses different SDKs for each provider:

```bash
# For Alibaba Cloud OSS
pnpm add ali-oss

# For AWS S3 and Cloudflare R2
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# For Tencent Cloud COS
pnpm add cos-nodejs-sdk-v5
```

## Configuration

### Selecting the Default Provider

Set the `STORAGE_PROVIDER` environment variable to choose your default provider:

```bash
# Options: oss, s3, r2, cos
STORAGE_PROVIDER=s3
```

### Alibaba Cloud OSS Configuration

Add the following environment variables to your `.env` file:

```bash
# Alibaba Cloud OSS Configuration
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your-bucket-name
OSS_ENDPOINT=your-custom-endpoint  # Optional
```

### AWS S3 Configuration

```bash
# AWS S3 Configuration
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your_access_key_id
S3_ACCESS_KEY_SECRET=your_secret_access_key
S3_BUCKET=your-bucket-name
S3_ENDPOINT=  # Optional: custom endpoint for S3-compatible services
S3_FORCE_PATH_STYLE=false  # Optional: force path-style access
```

### Cloudflare R2 Configuration

```bash
# Cloudflare R2 Configuration
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_ACCESS_KEY_SECRET=your_r2_access_key_secret
R2_BUCKET=your-bucket-name
```

Notes:
- `CLOUDFLARE_ACCOUNT_ID` is now the recommended account ID for R2
- `R2_ACCOUNT_ID` is still supported as a backward-compatible fallback

### Tencent Cloud COS Configuration

```bash
# Tencent Cloud COS Configuration
COS_REGION=ap-guangzhou
COS_SECRET_ID=your_secret_id
COS_SECRET_KEY=your_secret_key
COS_BUCKET=your-bucket-name-appid  # Format: bucket-appid, e.g., example-1250000000
```

The configuration is automatically loaded from `config.ts`:

```typescript
import { config } from '@config';

// Default provider (can be set via STORAGE_PROVIDER env var)
config.storage.defaultProvider // 'oss' | 's3' | 'r2' | 'cos'

// OSS configuration
config.storage.oss.region
config.storage.oss.accessKeyId
config.storage.oss.accessKeySecret
config.storage.oss.bucket
config.storage.oss.endpoint

// S3 configuration
config.storage.s3.region
config.storage.s3.accessKeyId
config.storage.s3.accessKeySecret
config.storage.s3.bucket
config.storage.s3.endpoint

// R2 configuration
config.storage.r2.accountId
config.storage.r2.accessKeyId
config.storage.r2.accessKeySecret
config.storage.r2.bucket

// COS configuration
config.storage.cos.region
config.storage.cos.secretId
config.storage.cos.secretKey
config.storage.cos.bucket
```

## Usage

### Basic Usage

The default storage instance uses the provider specified by `STORAGE_PROVIDER` env var:

```typescript
import { storage } from '@libs/storage';

// Upload a file (uses default provider)
const uploadResult = await storage.uploadFile({
  file: fileBuffer,
  fileName: 'release-v1.0.0.zip',
  contentType: 'application/zip',
  folder: 'releases/2024'
});

console.log('File uploaded:', uploadResult.key);
```

### Using a Specific Provider

```typescript
import { createStorageProvider } from '@libs/storage';

// Create OSS provider
const ossStorage = createStorageProvider('oss');

// Create S3 provider
const s3Storage = createStorageProvider('s3');

// Create R2 provider
const r2Storage = createStorageProvider('r2');

// Create COS provider
const cosStorage = createStorageProvider('cos');

// Upload to S3
const result = await s3Storage.uploadFile({
  file: fileBuffer,
  fileName: 'document.pdf',
  contentType: 'application/pdf'
});
```

### Direct Provider Instantiation

```typescript
import { OSSProvider, S3Provider, createR2Provider, COSProvider } from '@libs/storage';

// Create providers directly
const ossProvider = new OSSProvider();
const s3Provider = new S3Provider();
const r2Provider = createR2Provider();
const cosProvider = new COSProvider();

// Use with custom configuration (S3 only)
import { S3Provider, S3ProviderConfig } from '@libs/storage';

const customConfig: S3ProviderConfig = {
  region: 'eu-west-1',
  accessKeyId: 'custom-key',
  accessKeySecret: 'custom-secret',
  bucket: 'custom-bucket',
  endpoint: 'https://custom-endpoint.com',
  forcePathStyle: true
};

const customS3 = new S3Provider(customConfig);
```

## API Reference

### StorageProvider Interface

#### uploadFile(params: UploadParams): Promise<UploadResult>

Upload a file to storage.

```typescript
const result = await storage.uploadFile({
  file: Buffer.from('file content'),
  fileName: 'example.txt',
  contentType: 'text/plain',
  metadata: { version: '1.0.0' },
  folder: 'documents'
});

// Returns:
// {
//   key: 'documents/example.txt',
//   url: 'https://bucket.s3.amazonaws.com/documents/example.txt',
//   size: 12,
//   etag: '"abc123..."'
// }
```

#### generateSignedUrl(params: SignedUrlParams): Promise<SignedUrlResult>

Generate a signed URL for secure file access.

```typescript
const signedUrl = await storage.generateSignedUrl({
  key: 'documents/example.txt',
  expiresIn: 3600, // 1 hour
  operation: 'get'
});

// Returns:
// {
//   url: 'https://bucket.s3.amazonaws.com/documents/example.txt?X-Amz-Signature=...',
//   expiresAt: Date
// }
```

#### deleteFile(key: string): Promise<boolean>

Delete a file from storage.

```typescript
const deleted = await storage.deleteFile('documents/example.txt');
console.log('File deleted:', deleted); // true
```

#### fileExists(key: string): Promise<boolean>

Check if a file exists in storage.

```typescript
const exists = await storage.fileExists('documents/example.txt');
console.log('File exists:', exists); // true/false
```

#### getFileMetadata(key: string): Promise<FileMetadata>

Get file metadata and information.

```typescript
const metadata = await storage.getFileMetadata('documents/example.txt');

// Returns:
// {
//   key: 'documents/example.txt',
//   size: 12,
//   lastModified: Date,
//   contentType: 'text/plain',
//   etag: '"abc123..."',
//   metadata: { version: '1.0.0' }
// }
```

#### listFiles(folder: string, limit?: number): Promise<FileMetadata[]>

List files in a specific folder.

```typescript
const files = await storage.listFiles('documents', 10);

// Returns array of FileMetadata objects
files.forEach(file => {
  console.log(`${file.key} (${file.size} bytes)`);
});
```

## Types

### UploadParams
```typescript
interface UploadParams {
  file: Buffer;
  fileName: string;
  contentType?: string;
  metadata?: Record<string, string>;
  folder?: string;
}
```

### UploadResult
```typescript
interface UploadResult {
  key: string;
  url?: string;
  size: number;
  etag?: string;
}
```

### SignedUrlParams
```typescript
interface SignedUrlParams {
  key: string;
  expiresIn?: number; // seconds
  contentType?: string;
  operation?: 'get' | 'put';
}
```

### SignedUrlResult
```typescript
interface SignedUrlResult {
  url: string;
  expiresAt: Date;
}
```

### FileMetadata
```typescript
interface FileMetadata {
  key: string;
  size: number;
  lastModified: Date;
  contentType?: string;
  etag?: string;
  metadata?: Record<string, string>;
}
```

### S3ProviderConfig
```typescript
interface S3ProviderConfig {
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint?: string;
  defaultExpiration?: number;
  forcePathStyle?: boolean;
}
```

### COSProviderConfig
```typescript
interface COSProviderConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  defaultExpiration?: number;
}
```

## Error Handling

The library provides comprehensive error handling:

```typescript
try {
  const result = await storage.uploadFile(params);
} catch (error) {
  if (error.message.includes('Failed to upload file')) {
    // Handle upload error
    console.error('Upload failed:', error.message);
  }
}
```

Common error scenarios:
- **Authentication errors**: Invalid credentials
- **Permission errors**: Insufficient bucket permissions
- **Network errors**: Connection timeouts or failures
- **File not found**: Attempting to access non-existent files
- **Quota exceeded**: Storage quota or rate limits reached

## Security Considerations

### Access Control
- Use IAM roles and policies to limit storage access
- Store credentials securely (environment variables)
- Rotate access keys regularly

### Signed URLs
- Set appropriate expiration times (default: 1 hour)
- Use HTTPS for all operations
- Consider IP restrictions for sensitive files

### File Validation
- Validate file types and sizes before upload
- Scan files for malware if needed
- Use content-type validation

## Best Practices

### File Organization
```typescript
// Good: Organize files in logical folders
await storage.uploadFile({
  file: fileBuffer,
  fileName: 'app-v1.2.3.zip',
  folder: 'releases/2024/01'
});

// Good: Use consistent naming conventions
await storage.uploadFile({
  file: fileBuffer,
  fileName: `release-${version}-${timestamp}.zip`,
  folder: 'releases'
});
```

### Error Handling
```typescript
// Good: Handle specific error cases
try {
  await storage.deleteFile(key);
} catch (error) {
  if (error.message.includes('NoSuchKey') || error.message.includes('NotFound')) {
    console.log('File already deleted');
  } else {
    console.error('Delete failed:', error);
    throw error;
  }
}
```

### Performance
```typescript
// Good: Check existence before operations
if (await storage.fileExists(key)) {
  const metadata = await storage.getFileMetadata(key);
  // Process existing file
}

// Good: Use appropriate expiration times
const shortTermUrl = await storage.generateSignedUrl({
  key: 'temp-file.txt',
  expiresIn: 300 // 5 minutes for temporary access
});
```

## Provider-Specific Notes

### Cloudflare R2

R2 is S3-compatible, so the library uses the S3Provider under the hood with R2-specific configuration:

- Region is automatically set to `auto`
- Path-style access is forced (R2 requirement)
- Endpoint is constructed from your account ID

```typescript
import { createR2Provider } from '@libs/storage';

// R2 provider is pre-configured with correct settings
const r2 = createR2Provider();
```

### AWS S3 vs S3-Compatible Services

The S3Provider supports any S3-compatible service (MinIO, DigitalOcean Spaces, etc.) by setting a custom endpoint:

```bash
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_FORCE_PATH_STYLE=true
```

### Tencent Cloud COS

Tencent Cloud COS uses the `cos-nodejs-sdk-v5` SDK for server-side environments:

- Bucket name format is `bucket-appid`, e.g., `example-1250000000`
- Region format is `ap-xxx`, e.g., `ap-guangzhou`, `ap-shanghai`, `ap-beijing`
- Supports custom metadata (prefixed with `x-cos-meta-`)

```typescript
import { COSProvider } from '@libs/storage';

// COS provider is pre-configured with correct settings
const cos = new COSProvider();

// Or use custom configuration
import { COSProvider, COSProviderConfig } from '@libs/storage';

const customConfig: COSProviderConfig = {
  secretId: 'your-secret-id',
  secretKey: 'your-secret-key',
  bucket: 'your-bucket-1250000000',
  region: 'ap-guangzhou'
};

const customCOS = new COSProvider(customConfig);
```

## Development

### Testing
```bash
# Run storage tests
pnpm test libs/storage

# Run specific provider tests
pnpm test libs/storage/providers/oss
pnpm test libs/storage/providers/s3
```

### Adding New Providers

1. Create provider implementation in `providers/`
2. Implement the `StorageProvider` interface
3. Add provider type to `StorageProviderType`
4. Update the factory function in `index.ts`
5. Add configuration in `config.ts`
6. Update documentation

## Troubleshooting

### Common Issues

**S3/R2 Authentication Error**
```
Error: Failed to upload file to S3: InvalidAccessKeyId
```
- Verify `S3_ACCESS_KEY_ID` and `S3_ACCESS_KEY_SECRET` (or R2 equivalents)
- Check IAM permissions for the access key

**OSS Authentication Error**
```
Error: Failed to upload file to OSS: InvalidAccessKeyId
```
- Verify `OSS_ACCESS_KEY_ID` and `OSS_ACCESS_KEY_SECRET`
- Check IAM permissions for the access key

**Bucket Access Error**
```
Error: Failed to upload file: NoSuchBucket
```
- Verify bucket name configuration
- Ensure bucket exists in the specified region

**R2 CORS Issues**
If you're accessing R2 from a browser, ensure you've configured CORS on your R2 bucket through the Cloudflare dashboard.

**COS Authentication Error**
```
Error: Failed to upload file to COS: InvalidSecretId
```
- Verify `COS_SECRET_ID` and `COS_SECRET_KEY`
- Check CAM permissions for the access key
- Ensure bucket name format is correct (bucket-appid)

**COS CORS Issues**
If you're accessing COS from a browser, configure CORS rules for your COS bucket in the Tencent Cloud console.

**Network Timeout**
```
Error: Failed to upload file: RequestTimeout
```
- Check network connectivity
- Consider increasing timeout values
- Verify endpoint configuration

### Debug Mode

Enable debug logging by setting environment variable:
```bash
DEBUG=storage:* npm start
```

## License

This library is part of the TinyShip project and follows the same license terms.
