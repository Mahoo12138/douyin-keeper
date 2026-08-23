import { db } from '@libs/database'
import { commission, user } from '@libs/database/schema'
import { eq, desc, count, like, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const limit = parseInt(String(query.limit || '10')) || 10
    const page = parseInt(String(query.page || '1')) || 1
    const offset = query.offset ? parseInt(String(query.offset)) : (page - 1) * limit
    const searchValue = (query.searchValue || query.search) ? String(query.searchValue || query.search) : undefined
    const searchField = query.searchField ? String(query.searchField) : 'referrerEmail'
    const status = query.status ? String(query.status) : undefined

    const whereConditions: any[] = []
    if (status) whereConditions.push(eq(commission.status, status))
    if (searchValue) {
      switch (searchField) {
        case 'referrerEmail':
          whereConditions.push(like(user.email, `%${searchValue}%`))
          break
        case 'referrerName':
          whereConditions.push(like(user.name, `%${searchValue}%`))
          break
        case 'orderId':
          whereConditions.push(like(commission.orderId, `%${searchValue}%`))
          break
        default:
          whereConditions.push(like(user.email, `%${searchValue}%`))
      }
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined

    const baseQuery = db.select({
      id: commission.id,
      referrerId: commission.referrerId,
      orderId: commission.orderId,
      buyerId: commission.buyerId,
      orderAmount: commission.orderAmount,
      currency: commission.currency,
      commissionRate: commission.commissionRate,
      commissionAmount: commission.commissionAmount,
      status: commission.status,
      createdAt: commission.createdAt,
      referrerEmail: user.email,
      referrerName: user.name,
    })
    .from(commission)
    .leftJoin(user, eq(commission.referrerId, user.id))

    const countQuery = db.select({ count: count() }).from(commission).leftJoin(user, eq(commission.referrerId, user.id))

    const [totalResult, commissions] = await Promise.all([
      whereClause ? countQuery.where(whereClause) : countQuery,
      whereClause
        ? baseQuery.where(whereClause).orderBy(desc(commission.createdAt)).limit(limit).offset(offset)
        : baseQuery.orderBy(desc(commission.createdAt)).limit(limit).offset(offset),
    ])

    return {
      commissions,
      total: totalResult[0]?.count || 0,
      page,
      pageSize: limit,
      totalPages: Math.ceil((totalResult[0]?.count || 0) / limit),
    }
  } catch (error) {
    console.error('Failed to fetch admin commissions:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch commissions' })
  }
})
