import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'
import type { StorageProvider } from '@libs/storage/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp']
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
const SUPPORTED_PROVIDERS = ['oss', 's3', 'r2', 'cos'] as const
type StorageProviderType = typeof SUPPORTED_PROVIDERS[number]

function isValidExtension(fileName: string): boolean {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase()
  return ALLOWED_EXTENSIONS.includes(ext)
}

function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 8)
  const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg'
  return `${timestamp}-${randomStr}.${ext}`
}

/** Accept only deployable HTTPS custom domains, not documentation placeholders. */
function resolveWorkersR2PublicUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return null
    if (parsed.hostname === 'example.com' || parsed.hostname.endsWith('.example.com')) {
      return null
    }

    return trimmed
  } catch {
    return null
  }
}

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

          const formData = await request.formData()
          const file = formData.get('file') as File | null
          const providerParam = formData.get('provider') as string | null

          if (!file) return Response.json({ error: 'No file provided' }, { status: 400 })
          if (file.size > MAX_FILE_SIZE) return Response.json({ error: `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 })
          if (!ALLOWED_MIME_TYPES.includes(file.type)) return Response.json({ error: 'Invalid file type. Only images are allowed', allowedTypes: ALLOWED_MIME_TYPES }, { status: 400 })
          if (!isValidExtension(file.name)) return Response.json({ error: 'Invalid file extension', allowedExtensions: ALLOWED_EXTENSIONS }, { status: 400 })

          let provider: StorageProviderType = 'oss'
          if (providerParam && SUPPORTED_PROVIDERS.includes(providerParam as StorageProviderType)) provider = providerParam as StorageProviderType

          const arrayBuffer = await file.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const uniqueFileName = generateUniqueFileName(file.name)
          const userId = session.user.id
          const folder = `uploads/${userId}`
          const { isWorkersRuntime } = await import('@libs/database')
          let storage: StorageProvider

          if (isWorkersRuntime) {
            if (provider !== 'r2') {
              return Response.json(
                { error: `Storage provider "${provider}" is not available in the Cloudflare Workers deployment. Use R2 or a Node deployment.` },
                { status: 400 },
              )
            }

            const [{ R2BindingProvider }, { env }] = await Promise.all([
              import('@libs/storage/providers/r2-binding'),
              import('cloudflare:workers'),
            ])
            const bucket = (env as Record<string, unknown>).R2_BUCKET
            if (!bucket) {
              throw new Error('R2_BUCKET binding is not configured. Add it to apps/tanstack-app/wrangler.jsonc.')
            }
            const publicUrl = resolveWorkersR2PublicUrl((env as Record<string, unknown>).R2_PUBLIC_URL)
            if (!publicUrl) {
              return Response.json(
                {
                  error: 'R2_PUBLIC_URL is not configured with a real HTTPS custom domain. Set it in apps/tanstack-app/.dev.vars for local wrangler dev or via wrangler vars/secrets before uploading on Cloudflare Workers.',
                },
                { status: 503 },
              )
            }
            storage = new R2BindingProvider({
              bucket: bucket as ConstructorParameters<typeof R2BindingProvider>[0]['bucket'],
              publicUrl,
            })
          } else {
            const { createStorageProvider } = await import('@libs/storage')
            storage = createStorageProvider(provider)
          }

          const uploadResult = await storage.uploadFile({
            file: buffer,
            fileName: uniqueFileName,
            contentType: file.type,
            folder,
            metadata: { originalName: file.name, uploadedBy: userId, uploadedAt: new Date().toISOString() },
          })

          let url: string
          let expiresAt: Date | undefined
          if (uploadResult.url) {
            url = uploadResult.url
          } else {
            const signedUrlResult = await storage.generateSignedUrl({ key: uploadResult.key, expiresIn: 3600, operation: 'get' })
            url = signedUrlResult.url
            expiresAt = signedUrlResult.expiresAt
          }

          return Response.json({
            success: true,
            data: { key: uploadResult.key, url, size: uploadResult.size, contentType: file.type, originalName: file.name, provider, ...(expiresAt && { expiresAt }) },
          })
        } catch (error: any) {
          console.error('Upload error:', error)
          return Response.json({ error: 'Failed to upload file', message: error.message }, { status: 500 })
        }
      }),
    },
  },
})
