import { eq, and, like, desc, asc, count } from 'drizzle-orm'
import { db, blogPost, user } from '@libs/database'
import { blogPostStatus } from '@libs/database/schema/blog-post'

/**
 * Get admin blog posts list with pagination, search, filter, and sort
 * Requires admin permissions (event.context.user set by permissions middleware)
 */
export default defineEventHandler(async (event) => {
  assertMethod(event, 'GET')

  try {
    const query = getQuery(event)

    const page = parseInt(query.page as string) || 1
    const pageSize = parseInt(query.pageSize as string) || parseInt(query.limit as string) || 10
    const search = (query.search as string || '').trim()
    const status = query.status as string || 'all'
    const sortBy = query.sortBy as string || 'createdAt'
    const sortDirection = query.sortDirection as string || 'desc'

    const offset = (page - 1) * pageSize

    const whereConditions = []

    if (search) {
      whereConditions.push(like(blogPost.title, `%${search}%`))
    }

    if (status !== 'all' && (status === blogPostStatus.DRAFT || status === blogPostStatus.PUBLISHED)) {
      whereConditions.push(eq(blogPost.status, status))
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined

    let orderBy
    if (sortBy === 'title') {
      orderBy = sortDirection === 'desc' ? desc(blogPost.title) : asc(blogPost.title)
    } else if (sortBy === 'status') {
      orderBy = sortDirection === 'desc' ? desc(blogPost.status) : asc(blogPost.status)
    } else if (sortBy === 'publishedAt') {
      orderBy = sortDirection === 'desc' ? desc(blogPost.publishedAt) : asc(blogPost.publishedAt)
    } else if (sortBy === 'authorName') {
      orderBy = sortDirection === 'desc' ? desc(user.name) : asc(user.name)
    } else {
      orderBy = sortDirection === 'desc' ? desc(blogPost.createdAt) : asc(blogPost.createdAt)
    }

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
      .orderBy(orderBy)
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
