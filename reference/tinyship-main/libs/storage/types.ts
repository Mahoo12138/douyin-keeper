/**
 * Storage upload parameters
 */
export interface UploadParams {
  file: Buffer;
  fileName: string;
  contentType?: string;
  metadata?: Record<string, string>;
  folder?: string; // Optional folder path
}

/**
 * Storage upload result
 */
export interface UploadResult {
  key: string; // Object key/path in storage
  url?: string; // Public URL (if available)
  size: number; // File size in bytes
  etag?: string; // Entity tag for file integrity
}

/**
 * Signed URL parameters
 */
export interface SignedUrlParams {
  key: string; // Object key/path
  expiresIn?: number; // Expiration time in seconds (default: 3600)
  contentType?: string; // Content type for upload URLs
  operation?: 'get' | 'put'; // Operation type (default: 'get')
}

/**
 * Signed URL result
 */
export interface SignedUrlResult {
  url: string; // Signed URL
  expiresAt: Date; // Expiration timestamp
}

/**
 * Storage file metadata
 */
export interface FileMetadata {
  key: string;
  size: number;
  lastModified: Date;
  contentType?: string;
  etag?: string;
  metadata?: Record<string, string>;
}

/**
 * Storage provider interface
 */
export interface StorageProvider {
  /**
   * Upload file to storage
   */
  uploadFile(params: UploadParams): Promise<UploadResult>;

  /**
   * Generate signed URL for file access
   */
  generateSignedUrl(params: SignedUrlParams): Promise<SignedUrlResult>;

  /**
   * Delete file from storage
   */
  deleteFile(key: string): Promise<boolean>;

  /**
   * Check if file exists
   */
  fileExists(key: string): Promise<boolean>;

  /**
   * Get file metadata
   */
  getFileMetadata(key: string): Promise<FileMetadata>;

  /**
   * List files in a folder (optional)
   */
  listFiles?(folder: string, limit?: number): Promise<FileMetadata[]>;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  provider: 'oss' | 's3' | 'r2' | 'cos'; // Support multiple providers
  bucket: string;
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  endpoint?: string;
  defaultExpiration?: number; // Default URL expiration in seconds
}

