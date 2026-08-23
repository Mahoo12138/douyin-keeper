import { eq } from 'drizzle-orm'
import { db, blogPost } from '@libs/database'
import { blogPostStatus } from '@libs/database/schema/blog-post'

/**
 * Update blog post by id
 * If status changes to 'published' and publishedAt was null, set publishedAt
 * Always set updatedAt
 * Requires admin permissions
 */
export default defineEventHandler(async (event) => {
  assertMethod(event, 'PATCH')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Post ID is required',
    })
  }

  try {
    const [existing] = await db
      .select({ status: blogPost.status, publishedAt: blogPost.publishedAt })
      .from(blogPost)
      .where(eq(blogPost.id, id))
      .limit(1)

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Blog post not found',
      })
    }

    const body = await readBody(event)
    const now = new Date()

    const updateData: Partial<typeof blogPost.$inferInsert> = {
      updatedAt: now,
    }

    if (body.title !== undefined) updateData.title = body.title
    if (body.slug !== undefined) updateData.slug = body.slug
    if (body.content !== undefined) updateData.content = body.content
    if (body.excerpt !== undefined) updateData.excerpt = body.excerpt
    if (body.coverImage !== undefined) updateData.coverImage = body.coverImage
    if (body.metadata !== undefined) updateData.metadata = body.metadata

    if (body.status !== undefined) {
      updateData.status = body.status
      if (
        body.status === blogPostStatus.PUBLISHED &&
        existing.publishedAt === null
      ) {
        updateData.publishedAt = now
      }
    }

    await db
      .update(blogPost)
      .set(updateData)
      .where(eq(blogPost.id, id))

    const [updated] = await db
      .select()
      .from(blogPost)
      .where(eq(blogPost.id, id))
      .limit(1)

    return updated
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    console.error('Error updating blog post:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
  }
})
