import { eq } from 'drizzle-orm'
import { db, blogPost } from '@libs/database'

/**
 * Delete blog post by id
 * Requires admin permissions
 */
export default defineEventHandler(async (event) => {
  assertMethod(event, 'DELETE')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Post ID is required',
    })
  }

  try {
    const [existing] = await db
      .select({ id: blogPost.id })
      .from(blogPost)
      .where(eq(blogPost.id, id))
      .limit(1)

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Blog post not found',
      })
    }

    await db.delete(blogPost).where(eq(blogPost.id, id))

    return { success: true, id }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    console.error('Error deleting blog post:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
  }
})
