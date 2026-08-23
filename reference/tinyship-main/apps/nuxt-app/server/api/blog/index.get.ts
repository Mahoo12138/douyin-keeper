import { eq, desc, count } from 'drizzle-orm'
import { db, blogPost, user } from '@libs/database'
import { blogPostStatus } from '@libs/database/schema/blog-post'

/**
 * List published blog posts only (PUBLIC - no auth required)
 * Ordered by publishedAt desc, with pagination
 */
export default defineEventHandler(async (event) => {
  assertMethod(event, 'GET')

  try {
    const query = getQuery(event)

    const page = parseInt(query.page as string) || 1
    const pageSize = parseInt(query.pageSize as string) || parseInt(query.limit as string) || 10

    const offset = (page - 1) * pageSize

    const whereClause = eq(blogPost.status, blogPostStatus.PUBLISHED)

    const totalResult = await db
      .select({ count: count() })
      .from(blogPost)
      .leftJoin(user, eq(blogPost.authorId, user.id))
      .where(whereClause)

    const total = totalResult[0]?.count ?? 0

    const posts = await db
      .select({
        id: blogPost.id,
        title: blogPost.title,
        slug: blogPost.slug,
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
      .where(whereClause)
      .orderBy(desc(blogPost.publishedAt))
      .limit(pageSize)
      .offset(offset)

    const totalPages = Math.ceil(total / pageSize)

    return {
      posts,
      total,
      page,
      pageSize,
      totalPages,
    }
  } catch (error) {
    console.error('Error fetching blog posts:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
  }
})
