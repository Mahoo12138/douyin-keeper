import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/affiliate/claim')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { applyReferralCodeToUser, getReferralCodeFromCookieHeader } = await import('@libs/affiliate')
          const { config } = await import('@config')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

          const cookieHeader = request.headers.get('cookie')
          const referralCode = getReferralCodeFromCookieHeader(cookieHeader, config.affiliate.cookie.name)

          const result = await applyReferralCodeToUser({
            userId: session.user.id,
            referralCode,
          })

          const response = Response.json(result)
          if (result.applied) {
            response.headers.set('Set-Cookie', `${config.affiliate.cookie.name}=; Path=/; Max-Age=0`)
          }
          return response
        } catch (error) {
          console.error('Failed to claim referral:', error)
          return Response.json({ error: 'Failed to claim referral' }, { status: 500 })
        }
      }),
    },
  },
})
