import { auth } from '@libs/auth'
import { db } from '@libs/database'
import { withdrawal } from '@libs/database/schema'
import { eq, desc, count } from 'drizzle-orm'

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

    const [totalResult, withdrawals] = await Promise.all([
      db.select({ count: count() }).from(withdrawal).where(eq(withdrawal.userId, currentUser.id)),
      db
        .select()
        .from(withdrawal)
        .where(eq(withdrawal.userId, currentUser.id))
        .orderBy(desc(withdrawal.createdAt))
        .limit(limit)
        .offset(offset),
    ])

    const total = totalResult[0]?.count || 0

    return {
      withdrawals,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    }
  } catch (error) {
    console.error('Failed to fetch withdrawal history:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch withdrawal history' })
  }
})
