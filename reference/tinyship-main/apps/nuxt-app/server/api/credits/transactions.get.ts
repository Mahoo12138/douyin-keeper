import { auth } from '@libs/auth'
import { creditService } from '@libs/credits'
import type { CreditTransactionType } from '@libs/credits'

/**
 * Get current user's credit transaction history with pagination
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
    const query = getQuery(event)
    const page = parseInt(query.page as string || '1', 10)
    const limit = Math.min(parseInt(query.limit as string || '10', 10), 100)
    const type = query.type as CreditTransactionType | undefined
    
    const result = await creditService.getTransactionsPaginated(user.id, {
      page,
      limit,
      type
    })
    
    return result
  } catch (error) {
    console.error('Failed to fetch credit transactions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch credit transactions'
    })
  }
})
