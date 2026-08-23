import { auth } from '@libs/auth'
import { db } from '@libs/database'
import { commission, user } from '@libs/database/schema'
import { eq, desc, count, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const currentUser = event.context.user || await (async () => {
    const headers = new Headers()
    Object.entries(getHeaders(event)).forEach(([key, value]) => {
      if (value) headers.set(key, value)
    })
    const session = await auth.api.getSession({ headers })
    return session?.user
  })()

  if (!currentUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    const query = getQuery(event)
    const page = parseInt(String(query.page || '1')) || 1
    const limit = parseInt(String(query.limit || '10')) || 10
    const offset = (page - 1) * limit

    const [totalResult, rawCommissions] = await Promise.all([
      db.select({ count: count() }).from(commission).where(eq(commission.referrerId, currentUser.id)),
      db
        .select()
        .from(commission)
        .where(eq(commission.referrerId, currentUser.id))
        .orderBy(desc(commission.createdAt))
        .limit(limit)
        .offset(offset),
    ])

    const buyerIds = [...new Set(rawCommissions.map(c => c.buyerId).filter(Boolean))]
    const buyerMap = new Map<string, { name: string | null; email: string }>()
    if (buyerIds.length > 0) {
      const buyers = await db.select({ id: user.id, name: user.name, email: user.email })
        .from(user).where(inArray(user.id, buyerIds))
      for (const b of buyers) {
        buyerMap.set(b.id, { name: b.name, email: b.email })
      }
    }

    const commissions = rawCommissions.map(c => ({
      ...c,
      buyer: buyerMap.get(c.buyerId) || null,
    }))

    const total = totalResult[0]?.count || 0

    return {
      commissions,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    }
  } catch (error) {
    console.error('Failed to fetch commissions:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch commissions' })
  }
})
