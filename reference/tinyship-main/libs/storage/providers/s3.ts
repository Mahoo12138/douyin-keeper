import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '@config';
import type {
  StorageProvider,
  UploadParams,
  UploadResult,
  SignedUrlParams,
  SignedUrlResult,
  FileMetadata,
} from '../types';

/**
 * S3-compatible Storage Provider Configuration
 */
export interface S3ProviderConfig {
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint?: string;
  defaultExpiration?: number;
  forcePathStyle?: boolean;
  /** Public base URL for constructing permanent URLs (e.g. https://cdn.example.com) */
  publicUrl?: string;
}

/**
 * AWS S3 and S3-compatible Storage Provider (supports AWS S3, Cloudflare R2, MinIO, etc.)
 */
export class S3Provider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private defaultExpiration: number;
  private endpoint?: string;
  private publicUrl?: string;

  constructor(providerConfig?: S3ProviderConfig) {
    // Use provided config or fall back to default S3 config
    const s3Config = providerConfig || config.storage.s3;

    this.client = new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.accessKeySecret,
      },
      endpoint: s3Config.endpoint,
      forcePathStyle: s3Config.forcePathStyle ?? false,
    });

    this.bucket = s3Config.bucket;
    this.endpoint = s3Config.endpoint;
    this.publicUrl = 'publicUrl' in s3Config ? (s3Config as S3ProviderConfig).publicUrl : undefined;
    this.defaultExpiration = s3Config.defaultExpiration || 3600; // 1 hour default
  }

  /**
   * Upload file to S3
   */
  async uploadFile(params: UploadParams): Promise<UploadResult> {
    try {
      const { file, fileName, contentType, metadata, folder } = params;

      // Generate key with optional folder structure
      const key = folder ? `${folder}/${fileName}` : fileName;

      // Prepare upload command
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file,
        ContentType: contentType || 'application/octet-stream',
        Metadata: metadata,
      });

      // Upload file to S3
      const result = await this.client.send(command);

      // Prefer public URL (permanent, no signature) over internal endpoint URL
      let url: string | undefined;
      if (this.publicUrl) {
        const base = this.publicUrl.replace(/\/+$/, '');
        url = `${base}/${key}`;
      } else if (this.endpoint) {
        url = `${this.endpoint}/${this.bucket}/${key}`;
      }

      return {
        key,
        url,
        size: file.length,
        etag: result.ETag,
      };
    } catch (error: unknown) {
      console.error('S3 upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to upload file to S3: ${errorMessage}`);
    }
  }

  /**
   * Generate signed URL for file access
   */
  async generateSignedUrl(params: SignedUrlParams): Promise<SignedUrlResult> {
    try {
      const { key, expiresIn = this.defaultExpiration, operation = 'get', contentType } = params;

      let command;
      if (operation === 'get') {
        command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });
      } else if (operation === 'put') {
        command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: contentType || 'application/octet-stream',
        });
      } else {
        throw new Error(`Unsupported operation: ${operation}`);
      }

      const url = await getSignedUrl(this.client, command, {
        expiresIn,
      });

      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return {
        url,
        expiresAt,
      };
    } catch (error: unknown) {
      console.error('S3 signed URL generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate signed URL: ${errorMessage}`);
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      console.error('S3 delete failed:', error);
      // If file doesn't exist, consider it as successful deletion
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return true;
      }
      return false;
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      console.error('S3 file existence check failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to check file existence: ${errorMessage}`);
    }
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(key: string): Promise<FileMetadata> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const result = await this.client.send(command);

      return {
        key,
        size: result.ContentLength || 0,
        lastModified: result.LastModified || new Date(),
        contentType: result.ContentType,
        etag: result.ETag,
        metadata: result.Metadata,
      };
    } catch (error: unknown) {
      console.error('S3 metadata retrieval failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get file metadata: ${errorMessage}`);
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(folder: string, limit: number = 100): Promise<FileMetadata[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: folder.endsWith('/') ? folder : `${folder}/`,
        MaxKeys: limit,
      });

      const result = await this.client.send(command);

      if (!result.Contents) {
        return [];
      }

      return result.Contents.map((obj) => ({
        key: obj.Key || '',
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        etag: obj.ETag,
      }));
    } catch (error: unknown) {
      console.error('S3 list files failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to list files: ${errorMessage}`);
    }
  }
}

/**
 * Create S3Provider with R2-specific configuration
 * R2 is S3-compatible, so we reuse S3Provider with R2 endpoint
 */
export function createR2Provider(): S3Provider {
  const r2Config = config.storage.r2;

  return new S3Provider({
    region: 'auto', // R2 uses 'auto' region
    accessKeyId: r2Config.accessKeyId,
    accessKeySecret: r2Config.accessKeySecret,
    bucket: r2Config.bucket,
    endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
    defaultExpiration: r2Config.defaultExpiration || 3600,
    forcePathStyle: true, // R2 requires path-style access
    publicUrl: r2Config.publicUrl || undefined,
  });
}

