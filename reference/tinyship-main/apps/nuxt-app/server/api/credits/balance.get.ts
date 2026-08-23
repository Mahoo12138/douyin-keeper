import { auth } from '@libs/auth'
import { creditService } from '@libs/credits'

/**
 * Get current user's credit balance
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
    const balance = await creditService.getBalance(user.id)
    return { balance }
  } catch (error) {
    console.error('Failed to fetch credit balance:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch credit balance'
    })
  }
})
