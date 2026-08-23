import OSS from 'ali-oss';
import { config } from '@config';
import type { 
  StorageProvider, 
  UploadParams, 
  UploadResult, 
  SignedUrlParams, 
  SignedUrlResult,
  FileMetadata 
} from '../types';

/**
 * Alibaba Cloud OSS Storage Provider
 */
export class OSSProvider implements StorageProvider {
  private client: OSS;
  private bucket: string;
  private defaultExpiration: number;

  constructor() {
    const ossConfig = config.storage.oss;
    
    this.client = new OSS({
      region: ossConfig.region,
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      bucket: ossConfig.bucket,
      endpoint: ossConfig.endpoint,
      secure: true
    });

    this.bucket = ossConfig.bucket;
    this.defaultExpiration = ossConfig.defaultExpiration || 3600; // 1 hour default
  }

  /**
   * Upload file to OSS
   */
  async uploadFile(params: UploadParams): Promise<UploadResult> {
    try {
      const { file, fileName, contentType, metadata, folder } = params;
      
      // Generate unique key with optional folder structure
      const key = folder ? `${folder}/${fileName}` : fileName;
      
      // Prepare upload options
      const options: any = {
        headers: {},
        meta: metadata || {}
      };

      if (contentType) {
        options.headers['Content-Type'] = contentType;
      }

      // Upload file to OSS
      const result = await this.client.put(key, file, options);
      const headers = result.res?.headers as Record<string, string> | undefined;

      return {
        key: result.name,
        url: result.url,
        size: file.length,
        etag: headers?.etag
      };
    } catch (error: unknown) {
      console.error('OSS upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to upload file to OSS: ${errorMessage}`);
    }
  }

  /**
   * Generate signed URL for file access
   */
  async generateSignedUrl(params: SignedUrlParams): Promise<SignedUrlResult> {
    try {
      const { key, expiresIn = this.defaultExpiration, operation = 'get' } = params;
      
      let url: string;
      
      if (operation === 'get') {
        // Generate signed URL for download
        url = this.client.signatureUrl(key, {
          expires: expiresIn,
          method: 'GET'
        });
      } else if (operation === 'put') {
        // Generate signed URL for upload
        url = this.client.signatureUrl(key, {
          expires: expiresIn,
          method: 'PUT',
          'Content-Type': params.contentType || 'application/octet-stream'
        });
      } else {
        throw new Error(`Unsupported operation: ${operation}`);
      }

      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return {
        url,
        expiresAt
      };
    } catch (error: unknown) {
      console.error('OSS signed URL generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate signed URL: ${errorMessage}`);
    }
  }

  /**
   * Delete file from OSS
   */
  async deleteFile(key: string): Promise<boolean> {
    try {
      await this.client.delete(key);
      return true;
    } catch (error: any) {
      console.error('OSS delete failed:', error);
      // If file doesn't exist, consider it as successful deletion
      if (error.code === 'NoSuchKey') {
        return true;
      }
      return false;
    }
  }

  /**
   * Check if file exists in OSS
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.head(key);
      return true;
    } catch (error: any) {
      if (error.code === 'NoSuchKey' || error.status === 404) {
        return false;
      }
      console.error('OSS file existence check failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to check file existence: ${errorMessage}`);
    }
  }

  /**
   * Get file metadata from OSS
   */
  async getFileMetadata(key: string): Promise<FileMetadata> {
    try {
      const result = await this.client.head(key);
      const headers = result.res.headers as Record<string, string>;
      
      // Convert OSS UserMeta (string | number values) to Record<string, string>
      const metadata: Record<string, string> = {};
      if (result.meta) {
        for (const [k, v] of Object.entries(result.meta)) {
          metadata[k] = String(v);
        }
      }
      
      return {
        key,
        size: parseInt(headers['content-length'] || '0'),
        lastModified: new Date(headers['last-modified'] || Date.now()),
        contentType: headers['content-type'],
        etag: headers['etag'],
        metadata
      };
    } catch (error: unknown) {
      console.error('OSS metadata retrieval failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get file metadata: ${errorMessage}`);
    }
  }

  /**
   * List files in a folder (optional implementation)
   */
  async listFiles(folder: string, limit: number = 100): Promise<FileMetadata[]> {
    try {
      const result = await this.client.list({
        prefix: folder.endsWith('/') ? folder : `${folder}/`,
        'max-keys': limit
      }, {});

      if (!result.objects) {
        return [];
      }

      return result.objects.map((obj) => ({
        key: obj.name,
        size: obj.size,
        lastModified: new Date(obj.lastModified),
        contentType: obj.type,
        etag: obj.etag
      }));
    } catch (error: unknown) {
      console.error('OSS list files failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to list files: ${errorMessage}`);
    }
  }
}

