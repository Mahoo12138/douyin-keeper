import { config } from '@config'

/**
 * Referral capture middleware.
 * Detects ?ref=CODE in the URL, stores it as a cookie (first-touch, 30 days),
 * and strips the param from the URL.
 */
export default defineNuxtRouteMiddleware((to) => {
  const refCode = to.query.ref as string | undefined
  if (!refCode) return

  const referralCookieName = config.affiliate.cookie.name
  const referralCookieMaxAge = config.affiliate.cookie.expiryDays * 24 * 60 * 60

  if (import.meta.server) {
    const existingCookie = useCookie(referralCookieName)
    if (!existingCookie.value) {
      const cookie = useCookie(referralCookieName, {
        maxAge: referralCookieMaxAge,
        path: '/',
        sameSite: 'lax',
      })
      cookie.value = refCode
    }
  }

  // Strip the ref param from URL
  const cleanQuery = { ...to.query }
  delete cleanQuery.ref
  const hasOtherParams = Object.keys(cleanQuery).length > 0

  return navigateTo(
    { path: to.path, query: hasOtherParams ? cleanQuery : undefined },
    { replace: true }
  )
})
