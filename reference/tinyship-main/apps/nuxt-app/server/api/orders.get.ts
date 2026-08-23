import { auth } from '@libs/auth'
import { db } from '@libs/database'
import { order } from '@libs/database/schema/order'
import { eq, desc, sql } from 'drizzle-orm'

/**
 * Get user's order history with pagination
 */
export default defineEventHandler(async (event) => {
  try {
    // Get current user session (authMiddleware verifies user is logged in)
    const user = event.context.user || await (async () => {
      const headers = new Headers()
      Object.entries(getHeaders(event)).forEach(([key, value]) => {
        if (value) headers.set(key, value)
      })
      
      const session = await auth.api.getSession({ headers })
      return session?.user
    })()
    
    const userId = user!.id
    
    // Parse pagination parameters
    const query = getQuery(event)
    const page = parseInt(query.page as string || '1', 10)
    const limit = Math.min(parseInt(query.limit as string || '10', 10), 100)
    const offset = (page - 1) * limit

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(order)
      .where(eq(order.userId, userId))
    
    const total = countResult[0]?.count || 0
    
    // Get paginated orders ordered by creation date (newest first)
    const userOrders = await db.select({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      planId: order.planId,
      status: order.status,
      provider: order.provider,
      providerOrderId: order.providerOrderId,
      metadata: order.metadata,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }).from(order)
      .where(eq(order.userId, userId))
      .orderBy(desc(order.createdAt))
      .limit(limit)
      .offset(offset)
    
    return {
      orders: userOrders,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    }
  } catch (error) {
    console.error('Failed to fetch user orders:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch orders'
    })
  }
}) 