import { auth } from '@libs/auth'
import { creditService } from '@libs/credits'
import { checkSubscriptionStatus } from '@libs/database/utils/subscription'

/**
 * Get current user's credit status summary
 * Includes balance, subscription status, and usage stats
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user || await (async () => {
    const headers = new Headers()
    Object.entries(getHeaders(event)).forEach(([key, value]) => {
      if (value) headers.set(key, value)
    })
    
    const session = await auth.api.getSession({ headers })
    return session?.user
  })()
  
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }
  
  try {
    const [creditStatus, subscription] = await Promise.all([
      creditService.getStatus(user.id),
      checkSubscriptionStatus(user.id)
    ])
    
    return {
      credits: {
        balance: creditStatus.balance,
        totalPurchased: creditStatus.totalPurchased,
        totalConsumed: creditStatus.totalConsumed
      },
      hasSubscription: !!subscription,
      canAccess: !!subscription || creditStatus.balance > 0
    }
  } catch (error) {
    console.error('Failed to fetch credit status:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch credit status'
    })
  }
})
