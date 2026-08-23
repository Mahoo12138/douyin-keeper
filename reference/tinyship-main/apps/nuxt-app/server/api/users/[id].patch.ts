import { eq } from 'drizzle-orm'
import { db } from '@libs/database/client'
import { user } from '@libs/database/schema'
import { userRoles } from '@libs/database/constants'

export default defineEventHandler(async (event) => {
  // Only allow PATCH method
  assertMethod(event, 'PATCH')
  
  // Get user ID from route params
  const userId = getRouterParam(event, 'id')
  
  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  try {
    // Parse request body
    const body = await readBody(event)
    
    // Check if user exists
    const existingUser = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    if (!existingUser || existingUser.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Prepare update data (exclude sensitive fields and undefined values)
    const updateData: any = {
      updatedAt: new Date()
    }

    // Only update fields that are provided in the request
    if (body.name !== undefined) updateData.name = body.name
    if (body.image !== undefined) updateData.image = body.image || null
    if (body.phoneNumber !== undefined) updateData.phoneNumber = body.phoneNumber || null
    if (body.emailVerified !== undefined) updateData.emailVerified = body.emailVerified
    if (body.phoneNumberVerified !== undefined) updateData.phoneNumberVerified = body.phoneNumberVerified
    if (body.banned !== undefined) updateData.banned = body.banned
    if (body.banReason !== undefined) updateData.banReason = body.banReason || null
    
    // Add role support - validate role value
    if (body.role !== undefined) {
      if (body.role !== userRoles.ADMIN && body.role !== userRoles.USER) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid role. Must be either admin or user'
        })
      }
      updateData.role = body.role
    }

    // Update user in database
    await db
      .update(user)
      .set(updateData)
      .where(eq(user.id, userId))

    return { 
      message: 'User updated successfully',
      userId 
    }
  } catch (error) {
    console.error('Error updating user:', error)
    
    if (error instanceof Error && 'statusCode' in error) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
}) 