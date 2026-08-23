import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@libs/auth';
import { headers } from 'next/headers';
import { createStorageProvider, StorageProviderType } from '@libs/storage';

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

export async function POST(request: NextRequest) {
  try {
    // Get user session (auth middleware has already verified user is logged in)
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const providerParam = formData.get('provider') as string | null;

    // Validate file exists
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { 
          error: 'Invalid file type. Only images are allowed (JPEG, PNG, GIF, WebP, SVG, BMP)',
          allowedTypes: ALLOWED_MIME_TYPES 
        },
        { status: 400 }
      );
    }

    // Validate file extension
    if (!isValidExtension(file.name)) {
      return NextResponse.json(
        { 
          error: 'Invalid file extension',
          allowedExtensions: ALLOWED_EXTENSIONS 
        },
        { status: 400 }
      );
    }

    // Determine storage provider
    let provider: StorageProviderType = 'oss'; // default
    if (providerParam && SUPPORTED_PROVIDERS.includes(providerParam as StorageProviderType)) {
      provider = providerParam as StorageProviderType;
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate unique file name and folder path
    const uniqueFileName = generateUniqueFileName(file.name);
    const userId = session.user.id;
    const folder = `uploads/${userId}`;

    // Create storage provider and upload
    const storage = createStorageProvider(provider);
    const uploadResult = await storage.uploadFile({
      file: buffer,
      fileName: uniqueFileName,
      contentType: file.type,
      folder,
      metadata: {
        originalName: file.name,
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

    return NextResponse.json({
      success: true,
      data: {
        key: uploadResult.key,
        url,
        size: uploadResult.size,
        contentType: file.type,
        originalName: file.name,
        provider,
        ...(expiresAt && { expiresAt }),
      },
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to upload file',
        message: error.message 
      },
      { status: 500 }
    );
  }
}

