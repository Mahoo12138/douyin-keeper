import { auth } from '@libs/auth'
import { db } from '@libs/database'
import { user } from '@libs/database/schema'
import { eq, sql, desc, count } from 'drizzle-orm'
import { generateReferralCode } from '@libs/affiliate'

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

    const referralCode = await generateReferralCode(currentUser.id)

    const [totalResult, referrals] = await Promise.all([
      db.select({ count: count() }).from(user).where(eq(user.referredByCode, referralCode)),
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
        })
        .from(user)
        .where(eq(user.referredByCode, referralCode))
        .orderBy(desc(user.createdAt))
        .limit(limit)
        .offset(offset),
    ])

    const total = totalResult[0]?.count || 0

    // Mask email for privacy
    const maskedReferrals = referrals.map(r => ({
      ...r,
      email: r.email.replace(/(.{2}).*(@.*)/, '$1***$2'),
      name: r.name ? r.name.substring(0, 2) + '***' : null,
    }))

    return {
      referrals: maskedReferrals,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    }
  } catch (error) {
    console.error('Failed to fetch referrals:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch referrals' })
  }
})
