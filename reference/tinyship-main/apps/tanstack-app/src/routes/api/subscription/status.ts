import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/subscription/status')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        const { auth } = await import('@libs/auth')
        const { checkSubscriptionStatus, isLifetimeMember } = await import('@libs/database/utils/subscription')

        const session = await auth.api.getSession({ headers: new Headers(request.headers) })
        if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const userId = session.user.id
        const subscription = await checkSubscriptionStatus(userId)
        const isLifetime = await isLifetimeMember(userId)

        return Response.json({ hasSubscription: !!subscription, isLifetime, subscription: subscription || null })
      }),
    },
  },
})
