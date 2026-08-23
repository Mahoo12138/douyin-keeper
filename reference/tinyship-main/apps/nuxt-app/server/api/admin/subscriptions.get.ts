import { eq, desc, asc, like, and, or, count, sql, isNotNull, isNull } from 'drizzle-orm'
import { db } from '@libs/database/client'
import { subscription } from '@libs/database/schema/subscription'
import { user } from '@libs/database/schema/user'

/**
 * Get admin subscriptions list with pagination
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
          whereConditions.push(like(subscription.id, `%${searchValue}%`))
          break
        case 'userId':
          whereConditions.push(eq(subscription.userId, searchValue))
          break
        case 'planId':
          whereConditions.push(
            and(
              isNotNull(subscription.planId),
              like(subscription.planId, `%${searchValue}%`)
            )
          )
          break
        case 'stripeSubscriptionId':
          whereConditions.push(
            and(
              isNotNull(subscription.stripeSubscriptionId),
              like(subscription.stripeSubscriptionId, `%${searchValue}%`)
            )
          )
          break
        case 'creemSubscriptionId':
          whereConditions.push(
            and(
              isNotNull(subscription.creemSubscriptionId),
              like(subscription.creemSubscriptionId, `%${searchValue}%`)
            )
          )
          break
        case 'dodoSubscriptionId':
          whereConditions.push(
            and(
              isNotNull(subscription.dodoSubscriptionId),
              like(subscription.dodoSubscriptionId, `%${searchValue}%`)
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
      whereConditions.push(eq(subscription.status, status))
    }

    // Provider filter
    if (provider !== 'all') {
      if (provider === 'stripe') {
        whereConditions.push(
          or(
            isNotNull(subscription.stripeCustomerId),
            isNotNull(subscription.stripeSubscriptionId)
          )
        )
      } else if (provider === 'creem') {
        whereConditions.push(
          or(
            isNotNull(subscription.creemCustomerId),
            isNotNull(subscription.creemSubscriptionId)
          )
        )
      } else if (provider === 'dodo') {
        whereConditions.push(
          or(
            isNotNull(subscription.dodoCustomerId),
            isNotNull(subscription.dodoSubscriptionId)
          )
        )
      } else if (provider === 'wechat') {
        whereConditions.push(
          and(
            isNull(subscription.stripeCustomerId),
            isNull(subscription.stripeSubscriptionId),
            isNull(subscription.creemCustomerId),
            isNull(subscription.creemSubscriptionId),
            isNull(subscription.dodoCustomerId),
            isNull(subscription.dodoSubscriptionId)
          )
        )
      }
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
      orderBy = sortDirection === 'desc' ? desc(subscription.id) : asc(subscription.id)
    } else if (sortBy === 'status') {
      orderBy = sortDirection === 'desc' ? desc(subscription.status) : asc(subscription.status)
    } else if (sortBy === 'planId') {
      orderBy = sortDirection === 'desc' ? desc(subscription.planId) : asc(subscription.planId)
    } else if (sortBy === 'periodStart') {
      orderBy = sortDirection === 'desc' ? desc(subscription.periodStart) : asc(subscription.periodStart)
    } else if (sortBy === 'periodEnd') {
      orderBy = sortDirection === 'desc' ? desc(subscription.periodEnd) : asc(subscription.periodEnd)
    } else {
      // Default to createdAt
      orderBy = sortDirection === 'desc' ? desc(subscription.createdAt) : asc(subscription.createdAt)
    }

    // Get total count for pagination
    const totalResult = await db
      .select({ count: count() })
      .from(subscription)
      .leftJoin(user, eq(subscription.userId, user.id))
      .where(whereClause)

    const total = totalResult[0]?.count || 0

    // Get subscriptions data with user information
    const subscriptions = await db
      .select({
        id: subscription.id,
        userId: subscription.userId,
        planId: subscription.planId,
        status: subscription.status,
        paymentType: subscription.paymentType,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        creemCustomerId: subscription.creemCustomerId,
        creemSubscriptionId: subscription.creemSubscriptionId,
        dodoCustomerId: subscription.dodoCustomerId,
        dodoSubscriptionId: subscription.dodoSubscriptionId,
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        metadata: subscription.metadata,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
        // Associated user information
        userName: user.name,
        userEmail: user.email,
      })
      .from(subscription)
      .leftJoin(user, eq(subscription.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset)

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit)

    return {
      subscriptions,
      total,
      page,
      limit,
      totalPages
    }

  } catch (error) {
    console.error('Error fetching subscriptions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error'
    })
  }
}) 