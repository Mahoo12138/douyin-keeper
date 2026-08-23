import type {
  FileMetadata,
  SignedUrlParams,
  SignedUrlResult,
  StorageProvider,
  UploadParams,
  UploadResult,
} from '../types';

interface R2Object {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView, options?: {
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
  }): Promise<R2Object | null>;
  head(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{ objects: R2Object[] }>;
}

export interface R2BindingProviderOptions {
  bucket: R2Bucket;
  publicUrl?: string;
}

/** Cloudflare Workers-native R2 provider. It never uses S3 credentials or AWS SDKs. */
export class R2BindingProvider implements StorageProvider {
  private readonly bucket: R2Bucket;
  private readonly publicUrl?: string;

  constructor({ bucket, publicUrl }: R2BindingProviderOptions) {
    this.bucket = bucket;
    this.publicUrl = publicUrl?.replace(/\/+$/, '') || undefined;
  }

  async uploadFile({ file, fileName, contentType, metadata, folder }: UploadParams): Promise<UploadResult> {
    const key = folder ? `${folder}/${fileName}` : fileName;
    const object = await this.bucket.put(key, file, {
      httpMetadata: { contentType: contentType || 'application/octet-stream' },
      customMetadata: metadata,
    });

    if (!object) throw new Error('R2 upload failed without returning an object');

    return {
      key,
      url: this.publicUrl ? `${this.publicUrl}/${key}` : undefined,
      size: object.size,
      etag: object.etag,
    };
  }

  async generateSignedUrl(_params: SignedUrlParams): Promise<SignedUrlResult> {
    throw new Error(
      'Presigned URLs are not available through the Cloudflare R2 binding. Configure R2_PUBLIC_URL with a public custom domain instead.',
    );
  }

  async deleteFile(key: string): Promise<boolean> {
    await this.bucket.delete(key);
    return true;
  }

  async fileExists(key: string): Promise<boolean> {
    return (await this.bucket.head(key)) !== null;
  }

  async getFileMetadata(key: string): Promise<FileMetadata> {
    const object = await this.bucket.head(key);
    if (!object) throw new Error(`R2 object not found: ${key}`);
    return this.toMetadata(object);
  }

  async listFiles(folder?: string, limit?: number): Promise<FileMetadata[]> {
    const result = await this.bucket.list({ prefix: folder, limit });
    return result.objects.map((object) => this.toMetadata(object));
  }

  private toMetadata(object: R2Object): FileMetadata {
    return {
      key: object.key,
      size: object.size,
      lastModified: object.uploaded,
      contentType: object.httpMetadata?.contentType,
      etag: object.etag,
      metadata: object.customMetadata,
    };
  }
}
