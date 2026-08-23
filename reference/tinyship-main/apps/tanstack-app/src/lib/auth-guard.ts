import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import type { AppUser } from '@libs/permissions'

/**
 * Server function to get the current user's session.
 * Works both during SSR and client-side navigation (via RPC).
 */
const getAuthSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { withDbContext } = await import('@/lib/with-request-db')
  return withDbContext(async () => {
    try {
      const { getRequest } = await import('@tanstack/react-start/server')
      const { auth } = await import('@libs/auth')
      const request = getRequest()
      const session = await auth.api.getSession({
        headers: new Headers(request.headers),
      })
      return {
        user: session?.user
          ? { id: session.user.id, role: session.user.role }
          : null,
      }
    } catch (error) {
      console.error('[auth-guard] getAuthSession failed:', error)
      return { user: null }
    }
  })
})

/**
 * Server function to get auth + subscription access state.
 * Works for SSR and client-side navigation (via RPC).
 */
const getSubscriptionAccess = createServerFn({ method: 'GET' }).handler(async () => {
  const { withDbContext } = await import('@/lib/with-request-db')
  return withDbContext(async () => {
    try {
      const { getRequest } = await import('@tanstack/react-start/server')
      const { auth } = await import('@libs/auth')
      const { checkSubscriptionStatus } = await import('@libs/database/utils/subscription')
      const request = getRequest()
      const session = await auth.api.getSession({
        headers: new Headers(request.headers),
      })

      if (!session?.user) {
        return { user: null, hasSubscription: false }
      }

      const sub = await checkSubscriptionStatus(session.user.id)
      return {
        user: { id: session.user.id, role: session.user.role },
        hasSubscription: !!sub,
      }
    } catch (error) {
      console.error('[auth-guard] getSubscriptionAccess failed:', error)
      return { user: null, hasSubscription: false }
    }
  })
})

/**
 * Redirect authenticated users away from auth pages (signin, signup, etc.)
 * to the dashboard. Use in `beforeLoad` of auth routes.
 */
export async function redirectIfAuthenticated({
  params,
}: {
  params: { lang: string }
}) {
  const result = await getAuthSession()
  if (result?.user) {
    throw redirect({
      to: '/$lang/dashboard',
      params: { lang: params.lang },
    })
  }
}

/**
 * Require authentication. Redirects to signin if no session.
 * Use in `beforeLoad` of protected routes.
 */
export async function requireAuth({
  params,
}: {
  params: { lang: string }
}) {
  const result = await getAuthSession()
  const user = result?.user
  if (!user) {
    throw redirect({
      to: '/$lang/signin',
      params: { lang: params.lang },
    })
  }
  return { user }
}

/**
 * Require admin role. Redirects to signin or home page.
 * Use in `beforeLoad` of admin routes.
 */
export async function requireAdmin({
  params,
}: {
  params: { lang: string }
}) {
  const { user } = await requireAuth({ params })
  const { can, Action, Subject, Role } = await import('@libs/permissions')
  const appUser = {
    ...user,
    role: (user.role as (typeof Role)[keyof typeof Role]) || Role.NORMAL,
  } as AppUser

  if (!can(appUser, Action.MANAGE, Subject.ALL)) {
    throw redirect({
      to: '/$lang',
      params: { lang: params.lang },
    })
  }

  return { user }
}

/**
 * Require active subscription. Redirects to signin or pricing.
 * Use in `beforeLoad` of subscription-protected routes.
 */
export async function requireSubscription({
  params,
}: {
  params: { lang: string }
}) {
  const result = await getSubscriptionAccess()
  if (!result?.user) {
    throw redirect({
      to: '/$lang/signin',
      params: { lang: params.lang },
    })
  }

  if (!result.hasSubscription) {
    throw redirect({
      to: '/$lang/pricing',
      params: { lang: params.lang },
    })
  }

  return { user: result.user }
}
