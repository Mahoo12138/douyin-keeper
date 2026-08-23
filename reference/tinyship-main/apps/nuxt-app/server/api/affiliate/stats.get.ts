import { auth } from '@libs/auth'
import { generateReferralCode } from '@libs/affiliate'
import { db } from '@libs/database'
import { user, commission } from '@libs/database/schema'
import { eq, sql } from 'drizzle-orm'
import { config } from '@config'

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
    const referralCode = await generateReferralCode(currentUser.id)

    const userRecord = await db
      .select({ commissionBalance: user.commissionBalance, referredByCode: user.referredByCode })
      .from(user)
      .where(eq(user.id, currentUser.id))
      .limit(1)

    const commissionStats = await db
      .select({
        totalCommission: sql<string>`COALESCE(SUM(CAST(${commission.commissionAmount} AS REAL)), 0)`,
        totalReferrals: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(commission)
      .where(eq(commission.referrerId, currentUser.id))

    const referredUsers = await db
      .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
      .from(user)
      .where(eq(user.referredByCode, referralCode))

    return {
      referralCode,
      referralLink: `${config.app.baseUrl}?ref=${referralCode}`,
      commissionBalance: parseFloat(userRecord[0]?.commissionBalance || '0'),
      commissionRate: config.affiliate.commissionRate,
      totalCommission: parseFloat(commissionStats[0]?.totalCommission || '0'),
      totalPaidReferrals: commissionStats[0]?.totalReferrals || 0,
      totalRegisteredReferrals: referredUsers[0]?.count || 0,
      currency: config.affiliate.currency,
      referrerSignupBonus: config.affiliate.referrerSignupBonus,
      refereeSignupBonus: config.affiliate.refereeSignupBonus,
      minWithdrawalAmount: config.affiliate.minWithdrawalAmount,
      enabled: config.affiliate.enabled,
    }
  } catch (error) {
    console.error('Failed to fetch affiliate stats:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch affiliate stats' })
  }
})
