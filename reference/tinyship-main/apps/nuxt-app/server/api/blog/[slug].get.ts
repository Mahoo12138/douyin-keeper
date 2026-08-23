import { eq, and } from 'drizzle-orm'
import { db, blogPost, user } from '@libs/database'
import { blogPostStatus } from '@libs/database/schema/blog-post'

/**
 * Get single published blog post by slug (PUBLIC - no auth required)
 * Returns 404 if not found or not published
 */
export default defineEventHandler(async (event) => {
  assertMethod(event, 'GET')

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Slug is required',
    })
  }

  try {
    const [row] = await db
      .select({
        id: blogPost.id,
        title: blogPost.title,
        slug: blogPost.slug,
        content: blogPost.content,
        excerpt: blogPost.excerpt,
        coverImage: blogPost.coverImage,
        authorId: blogPost.authorId,
        status: blogPost.status,
        publishedAt: blogPost.publishedAt,
        createdAt: blogPost.createdAt,
        updatedAt: blogPost.updatedAt,
        metadata: blogPost.metadata,
        authorName: user.name,
      })
      .from(blogPost)
      .leftJoin(user, eq(blogPost.authorId, user.id))
      .where(and(eq(blogPost.slug, slug), eq(blogPost.status, blogPostStatus.PUBLISHED)))
      .limit(1)

    if (!row) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Blog post not found',
      })
    }

    return row
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    console.error('Error fetching blog post:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
  }
})
