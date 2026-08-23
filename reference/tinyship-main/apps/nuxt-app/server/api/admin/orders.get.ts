import { eq, desc, asc, like, and, or, count, sql, isNotNull } from 'drizzle-orm'
import { db } from '@libs/database/client'
import { order } from '@libs/database/schema/order'
import { user } from '@libs/database/schema/user'

/**
 * Get admin orders list with pagination
 * Requires admin permissions
 */
export default defineEventHandler(async (event) => {
  // Only allow GET method
  assertMethod(event, 'GET')

  try {
    // Parse query parameters
    const query = getQuery(event)
    
    const page = parseInt(query.page as string) || 1
    const limit = parseInt(query.limit as string) || 10
    const searchValue = query.searchValue as string || ''
    const searchField = query.searchField as string || 'userEmail'
    const status = query.status as string || 'all'
    const provider = query.provider as string || 'all'
    const sortBy = query.sortBy as string || 'createdAt'
    const sortDirection = query.sortDirection as string || 'desc'

    // Calculate offset for pagination
    const offset = (page - 1) * limit

    // Build WHERE clause
    const whereConditions = []

    // Search functionality
    if (searchValue.trim()) {
      switch (searchField) {
        case 'id':
          whereConditions.push(like(order.id, `%${searchValue}%`))
          break
        case 'userId':
          whereConditions.push(eq(order.userId, searchValue))
          break
        case 'planId':
          whereConditions.push(like(order.planId, `%${searchValue}%`))
          break
        case 'providerOrderId':
          whereConditions.push(
            and(
              isNotNull(order.providerOrderId),
              like(order.providerOrderId, `%${searchValue}%`)
            )
          )
          break
        case 'userEmail':
          whereConditions.push(like(user.email, `%${searchValue}%`))
          break
        default:
          // If invalid search field, search in user email
          whereConditions.push(like(user.email, `%${searchValue}%`))
      }
    }

    // Status filter
    if (status !== 'all') {
      whereConditions.push(eq(order.status, status))
    }

    // Provider filter
    if (provider !== 'all') {
      whereConditions.push(eq(order.provider, provider))
    }

    // Combine WHERE conditions
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined

    // Build ORDER BY clause
    let orderBy
    if (sortBy === 'userEmail') {
      orderBy = sortDirection === 'desc' ? desc(user.email) : asc(user.email)
    } else if (sortBy === 'userName') {
      orderBy = sortDirection === 'desc' ? desc(user.name) : asc(user.name)
    } else if (sortBy === 'id') {
      orderBy = sortDirection === 'desc' ? desc(order.id) : asc(order.id)
    } else if (sortBy === 'amount') {
      orderBy = sortDirection === 'desc' ? desc(order.amount) : asc(order.amount)
    } else if (sortBy === 'status') {
      orderBy = sortDirection === 'desc' ? desc(order.status) : asc(order.status)
    } else if (sortBy === 'provider') {
      orderBy = sortDirection === 'desc' ? desc(order.provider) : asc(order.provider)
    } else {
      // Default to createdAt
      orderBy = sortDirection === 'desc' ? desc(order.createdAt) : asc(order.createdAt)
    }

    // Get total count for pagination
    const totalResult = await db
      .select({ count: count() })
      .from(order)
      .leftJoin(user, eq(order.userId, user.id))
      .where(whereClause)

    const total = totalResult[0]?.count || 0

    // Get orders data with user information
    const orders = await db
      .select({
        id: order.id,
        userId: order.userId,
        amount: order.amount,
        currency: order.currency,
        planId: order.planId,
        status: order.status,
        provider: order.provider,
        providerOrderId: order.providerOrderId,
        metadata: order.metadata,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        // Associated user information
        userName: user.name,
        userEmail: user.email,
      })
      .from(order)
      .leftJoin(user, eq(order.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset)

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit)

    return {
      orders,
      total,
      page,
      limit,
      totalPages
    }

  } catch (error) {
    console.error('Error fetching orders:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error'
    })
  }
}) 