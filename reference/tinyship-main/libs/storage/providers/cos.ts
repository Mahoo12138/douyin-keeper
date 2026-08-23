import COS from 'cos-nodejs-sdk-v5';
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
 * Tencent Cloud COS Storage Provider Configuration
 */
export interface COSProviderConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  defaultExpiration?: number;
}

/**
 * Tencent Cloud COS Storage Provider
 * Uses cos-nodejs-sdk-v5 for object storage operations
 */
export class COSProvider implements StorageProvider {
  private client: COS;
  private bucket: string;
  private region: string;
  private defaultExpiration: number;

  constructor(providerConfig?: COSProviderConfig) {
    // Use provided config or fall back to default COS config
    const cosConfig = providerConfig || config.storage.cos;

    this.client = new COS({
      SecretId: cosConfig.secretId,
      SecretKey: cosConfig.secretKey,
    });

    this.bucket = cosConfig.bucket;
    this.region = cosConfig.region;
    this.defaultExpiration = cosConfig.defaultExpiration || 3600; // 1 hour default
  }

  /**
   * Upload file to COS
   */
  async uploadFile(params: UploadParams): Promise<UploadResult> {
    try {
      const { file, fileName, contentType, metadata, folder } = params;

      // Generate key with optional folder structure
      const key = folder ? `${folder}/${fileName}` : fileName;

      return new Promise((resolve, reject) => {
        this.client.putObject(
          {
            Bucket: this.bucket,
            Region: this.region,
            Key: key,
            Body: file,
            ContentType: contentType || 'application/octet-stream',
            // Add custom metadata with x-cos-meta- prefix
            Headers: metadata
              ? Object.fromEntries(
                  Object.entries(metadata).map(([k, v]) => [`x-cos-meta-${k}`, v])
                )
              : undefined,
          },
          (err, data) => {
            if (err) {
              console.error('COS upload failed:', err);
              reject(new Error(`Failed to upload file to COS: ${err.message}`));
              return;
            }

            // Construct URL
            const url = `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;

            resolve({
              key,
              url,
              size: file.length,
              etag: data.ETag,
            });
          }
        );
      });
    } catch (error: unknown) {
      console.error('COS upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to upload file to COS: ${errorMessage}`);
    }
  }

  /**
   * Generate signed URL for file access
   */
  async generateSignedUrl(params: SignedUrlParams): Promise<SignedUrlResult> {
    try {
      const { key, expiresIn = this.defaultExpiration, operation = 'get', contentType } = params;
      return new Promise((resolve, reject) => {
        this.client.getObjectUrl(
          {
            Bucket: this.bucket,
            Region: this.region,
            Key: key,
            Sign: true,
            Expires: expiresIn,
            Method: operation === 'get' ? 'GET' : 'PUT',
            Headers: operation === 'put' && contentType
              ? { 'Content-Type': contentType }
              : undefined,
          },
          (err, data) => {
            if (err) {
              console.error('COS signed URL generation failed:', err);
              reject(new Error(`Failed to generate signed URL: ${err.message}`));
              return;
            }

            const expiresAt = new Date(Date.now() + expiresIn * 1000);

            resolve({
              url: data.Url,
              expiresAt,
            });
          }
        );
      });
    } catch (error: unknown) {
      console.error('COS signed URL generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate signed URL: ${errorMessage}`);
    }
  }

  /**
   * Delete file from COS
   */
  async deleteFile(key: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.client.deleteObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
        },
        (err) => {
          if (err) {
            console.error('COS delete failed:', err);
            // If file doesn't exist, consider it as successful deletion
            if (err.statusCode === 404) {
              resolve(true);
              return;
            }
            resolve(false);
            return;
          }
          resolve(true);
        }
      );
    });
  }

  /**
   * Check if file exists in COS
   */
  async fileExists(key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.client.headObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
        },
        (err, data) => {
          if (err) {
            if (err.statusCode === 404) {
              resolve(false);
              return;
            }
            console.error('COS file existence check failed:', err);
            reject(new Error(`Failed to check file existence: ${err.message}`));
            return;
          }
          resolve(data.statusCode === 200);
        }
      );
    });
  }

  /**
   * Get file metadata from COS
   */
  async getFileMetadata(key: string): Promise<FileMetadata> {
    return new Promise((resolve, reject) => {
      this.client.headObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
        },
        (err, data) => {
          if (err) {
            console.error('COS metadata retrieval failed:', err);
            reject(new Error(`Failed to get file metadata: ${err.message}`));
            return;
          }

          const headers = data.headers || {};

          // Extract custom metadata with x-cos-meta- prefix
          const customMetadata: Record<string, string> = {};
          for (const [k, v] of Object.entries(headers)) {
            if (k.toLowerCase().startsWith('x-cos-meta-')) {
              const metaKey = k.substring('x-cos-meta-'.length);
              customMetadata[metaKey] = String(v);
            }
          }

          resolve({
            key,
            size: parseInt(headers['content-length'] || '0'),
            lastModified: new Date(headers['last-modified'] || Date.now()),
            contentType: headers['content-type'],
            etag: headers['etag'],
            metadata: Object.keys(customMetadata).length > 0 ? customMetadata : undefined,
          });
        }
      );
    });
  }

  /**
   * List files in a folder
   */
  async listFiles(folder: string, limit: number = 100): Promise<FileMetadata[]> {
    return new Promise((resolve, reject) => {
      this.client.getBucket(
        {
          Bucket: this.bucket,
          Region: this.region,
          Prefix: folder.endsWith('/') ? folder : `${folder}/`,
          MaxKeys: limit,
        },
        (err, data) => {
          if (err) {
            console.error('COS list files failed:', err);
            reject(new Error(`Failed to list files: ${err.message}`));
            return;
          }

          if (!data.Contents) {
            resolve([]);
            return;
          }

          const files: FileMetadata[] = data.Contents.map((obj: any) => ({
            key: obj.Key,
            size: parseInt(String(obj.Size) || '0'),
            lastModified: new Date(obj.LastModified),
            etag: obj.ETag,
          }));

          resolve(files);
        }
      );
    });
  }
}
