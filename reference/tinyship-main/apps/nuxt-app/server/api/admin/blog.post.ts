import { eq } from 'drizzle-orm'
import { db, blogPost } from '@libs/database'
import { blogPostStatus } from '@libs/database/schema/blog-post'

/**
 * Generate slug from title: lowercase, replace spaces with hyphens, remove special chars, append short random suffix
 */
function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'post'
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base}-${suffix}`
}

/**
 * Create a new blog post
 * Requires admin permissions (event.context.user set by permissions middleware)
 */
export default defineEventHandler(async (event) => {
  assertMethod(event, 'POST')

  const currentUser = event.context.user
  if (!currentUser?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }

  try {
    const body = await readBody(event)

    const title = body.title as string
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Title is required',
      })
    }

    const slug = (body.slug as string)?.trim() || generateSlug(title)
    const content = (body.content as string) ?? ''
    const excerpt = (body.excerpt as string) ?? null
    const coverImage = (body.coverImage as string) ?? null
    const status = (body.status as string) || blogPostStatus.DRAFT
    const metadata = body.metadata ?? null

    const id = crypto.randomUUID()
    const now = new Date()
    const publishedAt = status === blogPostStatus.PUBLISHED ? now : null

    await db.insert(blogPost).values({
      id,
      title: title.trim(),
      slug,
      content,
      excerpt,
      coverImage,
      authorId: currentUser.id,
      status,
      publishedAt,
      createdAt: now,
      updatedAt: now,
      metadata,
    })

    const [created] = await db
      .select()
      .from(blogPost)
      .where(eq(blogPost.id, id))
      .limit(1)

    return created
  } catch (error) {
    console.error('Error creating blog post:', error)
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
  }
})
