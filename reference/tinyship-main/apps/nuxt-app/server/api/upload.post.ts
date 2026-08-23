import { createStorageProvider } from '@libs/storage';
import type { StorageProviderType } from '@libs/storage';

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed image MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
];

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];

// Supported storage providers
const SUPPORTED_PROVIDERS: StorageProviderType[] = ['oss', 's3', 'r2', 'cos'];

/**
 * Validate file extension
 */
function isValidExtension(fileName: string): boolean {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * Generate unique file name with timestamp
 */
function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg';
  return `${timestamp}-${randomStr}.${ext}`;
}

export default defineEventHandler(async (event) => {
  try {
    // Get user from context (set by permissions middleware)
    const user = event.context.user;
    
    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
      });
    }

    // Parse multipart form data
    const formData = await readMultipartFormData(event);

    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No form data provided',
      });
    }

    // Extract file and provider from form data
    let fileData: { data: Buffer; filename: string; type: string } | null = null;
    let providerParam: string | null = null;

    for (const part of formData) {
      if (part.name === 'file' && part.filename) {
        fileData = {
          data: part.data,
          filename: part.filename,
          type: part.type || 'application/octet-stream',
        };
      } else if (part.name === 'provider') {
        providerParam = part.data.toString('utf8');
      }
    }

    // Validate file exists
    if (!fileData) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No file provided',
      });
    }

    // Validate file size
    if (fileData.data.length > MAX_FILE_SIZE) {
      throw createError({
        statusCode: 400,
        statusMessage: `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(fileData.type)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid file type. Only images are allowed (JPEG, PNG, GIF, WebP, SVG, BMP)',
        data: {
          allowedTypes: ALLOWED_MIME_TYPES,
        },
      });
    }

    // Validate file extension
    if (!isValidExtension(fileData.filename)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid file extension',
        data: {
          allowedExtensions: ALLOWED_EXTENSIONS,
        },
      });
    }

    // Determine storage provider
    let provider: StorageProviderType = 'oss'; // default
    if (providerParam && SUPPORTED_PROVIDERS.includes(providerParam as StorageProviderType)) {
      provider = providerParam as StorageProviderType;
    }

    // Generate unique file name and folder path
    const uniqueFileName = generateUniqueFileName(fileData.filename);
    const userId = user.id;
    const folder = `uploads/${userId}`;

    // Create storage provider and upload
    const storage = createStorageProvider(provider);
    const uploadResult = await storage.uploadFile({
      file: fileData.data,
      fileName: uniqueFileName,
      contentType: fileData.type,
      folder,
      metadata: {
        originalName: fileData.filename,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
      },
    });

    // Use permanent public URL when available; otherwise fall back to signed URL
    let url: string;
    let expiresAt: Date | undefined;

    if (uploadResult.url) {
      url = uploadResult.url;
    } else {
      const signedUrlResult = await storage.generateSignedUrl({
        key: uploadResult.key,
        expiresIn: 3600,
        operation: 'get',
      });
      url = signedUrlResult.url;
      expiresAt = signedUrlResult.expiresAt;
    }

    return {
      success: true,
      data: {
        key: uploadResult.key,
        url,
        size: uploadResult.size,
        contentType: fileData.type,
        originalName: fileData.filename,
        provider,
        ...(expiresAt && { expiresAt }),
      },
    };
  } catch (error: any) {
    console.error('Upload error:', error);

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to upload file',
      data: {
        message: error.message,
      },
    });
  }
});

