import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/payment/query')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { createPaymentProvider } = await import('@libs/payment')
          const { db } = await import('@libs/database')
          const { order } = await import('@libs/database/schema')
          const { eq } = await import('drizzle-orm')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

          const url = new URL(request.url)
          const orderId = url.searchParams.get('orderId')
          const provider = url.searchParams.get('provider') as 'wechat' | 'stripe'

          if (!orderId || !provider) return Response.json({ error: 'Missing orderId or provider' }, { status: 400 })

          const userOrder = await db.select({ id: order.id, userId: order.userId, provider: order.provider }).from(order).where(eq(order.id, orderId)).limit(1)
          if (!userOrder.length) return Response.json({ error: 'Order not found' }, { status: 404 })
          if (userOrder[0].userId !== session.user.id) return Response.json({ error: 'Access denied' }, { status: 403 })
          if (userOrder[0].provider !== provider) return Response.json({ error: 'Provider mismatch' }, { status: 400 })

          if (provider === 'wechat') {
            const wechatProvider = createPaymentProvider('wechat')
            const result = await wechatProvider.queryOrder(orderId)
            return Response.json(result)
          }
          return Response.json({ error: 'Unsupported provider' }, { status: 400 })
        } catch (error) {
          console.error('Payment query error:', error)
          return Response.json({ error: 'Query failed' }, { status: 500 })
        }
      }),
    },
  },
})
