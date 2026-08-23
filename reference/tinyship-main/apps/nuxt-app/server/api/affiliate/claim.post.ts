import { auth } from '@libs/auth'
import { applyReferralCodeToUser, getReferralCodeFromCookieHeader } from '@libs/affiliate'
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
    const cookieHeader = getHeader(event, 'cookie') || null
    const referralCode = getReferralCodeFromCookieHeader(cookieHeader, config.affiliate.cookie.name)

    const result = await applyReferralCodeToUser({
      userId: currentUser.id,
      referralCode,
    })

    if (result.applied) {
      deleteCookie(event, config.affiliate.cookie.name)
    }

    return result
  } catch (error) {
    console.error('Failed to claim referral:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to claim referral' })
  }
})
