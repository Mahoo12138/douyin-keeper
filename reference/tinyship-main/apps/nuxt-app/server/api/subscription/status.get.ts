import { auth } from '@libs/auth'
import { checkSubscriptionStatus, isLifetimeMember } from '@libs/database/utils/subscription'

/**
 * Get current user's subscription status
 */
export default defineEventHandler(async (event) => {
  try {
    // Get current user session (authMiddleware已验证用户已登录)
    const user = event.context.user || await (async () => {
      const headers = new Headers()
      Object.entries(getHeaders(event)).forEach(([key, value]) => {
        if (value) headers.set(key, value)
      })
      
      const session = await auth.api.getSession({ headers })
      return session?.user
    })()
    
    const userId = user!.id
    
    // Check subscription status
    const subscription = await checkSubscriptionStatus(userId)
    console.log('subscription', subscription)
    const isLifetime = await isLifetimeMember(userId)
    
    return {
      hasSubscription: !!subscription,
      isLifetime,
      subscription: subscription || null
    }
  } catch (error) {
    console.error('Failed to fetch subscription status:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch subscription status'
    })
  }
}) 