import { db, user } from '@libs/database'
import { desc, asc, count, like, eq, and, or, inArray } from 'drizzle-orm'

interface UserQueryParams {
  page?: number
  limit?: number
  searchField?: 'email' | 'name' | 'id'
  searchValue?: string
  role?: string
  banned?: 'true' | 'false' | 'all'
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export default defineEventHandler(async (event) => {
  try {
    // Get query parameters
    const query = getQuery(event) as UserQueryParams
    const page = parseInt(String(query.page || '1')) || 1
    const limit = parseInt(String(query.limit || '10')) || 10
    const offset = (page - 1) * limit

    // Build where conditions
    const conditions: any[] = []

    // Search conditions
    if (query.searchValue && query.searchField) {
      if (query.searchField === 'id') {
        conditions.push(eq(user.id, query.searchValue))
      } else if (query.searchField === 'email') {
        conditions.push(like(user.email, `%${query.searchValue}%`))
      } else if (query.searchField === 'name') {
        conditions.push(like(user.name, `%${query.searchValue}%`))
      }
    }

    // Role filter
    if (query.role && query.role !== 'all') {
      conditions.push(eq(user.role, query.role))
    }

    // Banned filter
    if (query.banned && query.banned !== 'all') {
      const isBanned = query.banned === 'true'
      conditions.push(eq(user.banned, isBanned))
    }

    // Determine sorting
    let orderBy
    if (query.sortBy) {
      const sortField = query.sortBy === 'createdAt' ? user.createdAt :
                       query.sortBy === 'updatedAt' ? user.updatedAt :
                       query.sortBy === 'email' ? user.email :
                       query.sortBy === 'name' ? user.name :
                       user.createdAt

      orderBy = query.sortDirection === 'asc' ? asc(sortField) : desc(sortField)
    } else {
      orderBy = desc(user.createdAt) // Default sort
    }

    // Build where clause
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Get users with pagination
    const users = await db.select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.image,
      emailVerified: user.emailVerified,
      phoneNumber: user.phoneNumber,
      phoneNumberVerified: user.phoneNumberVerified,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      referralCode: user.referralCode,
      referredByCode: user.referredByCode,
      commissionBalance: user.commissionBalance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

    // Get total count for pagination
    const countResult = await db.select({ 
      count: count() 
    }).from(user).where(whereClause)
    const totalCount = countResult[0]?.count ?? 0

    // Resolve referredByCode → referrer user info
    const codes = [...new Set(users.map(u => u.referredByCode).filter(Boolean))] as string[]
    let referrerMap: Record<string, { name: string | null; email: string }> = {}
    if (codes.length > 0) {
      const referrers = await db
        .select({ referralCode: user.referralCode, name: user.name, email: user.email })
        .from(user)
        .where(inArray(user.referralCode, codes))
      referrerMap = Object.fromEntries(
        referrers.map(r => [r.referralCode!, { name: r.name, email: r.email }])
      )
    }

    const enrichedUsers = users.map(u => ({
      ...u,
      referredBy: u.referredByCode ? referrerMap[u.referredByCode] || null : null,
    }))

    return {
      users: enrichedUsers,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit)
    }
  } catch (error) {
    console.error('Failed to fetch users:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch users'
    })
  }
}) 