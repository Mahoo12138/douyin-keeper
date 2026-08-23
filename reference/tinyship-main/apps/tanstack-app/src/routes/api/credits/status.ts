import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/credits/status')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { creditService } = await import('@libs/credits')
          const { checkSubscriptionStatus } = await import('@libs/database/utils/subscription')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

          const userId = session.user.id
          const [creditStatus, subscription] = await Promise.all([
            creditService.getStatus(userId),
            checkSubscriptionStatus(userId),
          ])

          return Response.json({
            credits: { balance: creditStatus.balance, totalPurchased: creditStatus.totalPurchased, totalConsumed: creditStatus.totalConsumed },
            hasSubscription: !!subscription,
            canAccess: !!subscription || creditStatus.balance > 0,
          })
        } catch (error) {
          console.error('Failed to fetch credit status:', error)
          return Response.json({ error: 'Failed to fetch credit status' }, { status: 500 })
        }
      }),
    },
  },
})
