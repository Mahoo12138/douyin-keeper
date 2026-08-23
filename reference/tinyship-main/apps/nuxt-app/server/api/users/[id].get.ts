import { eq } from 'drizzle-orm'
import { db } from '@libs/database/client'
import { user } from '@libs/database/schema'

export default defineEventHandler(async (event) => {
  // Get user ID from route params
  const userId = getRouterParam(event, 'id')
  
  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  try {
    // Fetch user from database
    const userData = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    if (!userData || userData.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Return user data (excluding sensitive fields)
    const userInfo = userData[0]
    const { ...safeUserData } = userInfo

    return safeUserData
  } catch (error) {
    console.error('Error fetching user:', error)
    
    if (error instanceof Error && 'statusCode' in error) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
}) 