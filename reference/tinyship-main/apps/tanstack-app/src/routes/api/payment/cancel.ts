import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/payment/cancel')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        const { auth } = await import('@libs/auth')
        const session = await auth.api.getSession({ headers: new Headers(request.headers) })
        if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })

        const url = new URL(request.url)
        const orderId = url.searchParams.get('orderId')
        const provider = url.searchParams.get('provider')

        if (!orderId) return Response.json({ error: 'Order ID is required' }, { status: 400 })
        if (!provider) return Response.json({ error: 'Provider is required' }, { status: 400 })

        try {
          const { db } = await import('@libs/database')
          const { order } = await import('@libs/database/schema/order')
          const { eq } = await import('drizzle-orm')
          const { createPaymentProvider } = await import('@libs/payment')

          const userOrder = await db
            .select({ id: order.id, userId: order.userId })
            .from(order)
            .where(eq(order.id, orderId))
            .limit(1)

          if (!userOrder.length) return Response.json({ error: 'Order not found' }, { status: 404 })
          if (userOrder[0].userId !== session.user.id) return Response.json({ error: 'Access denied' }, { status: 403 })

          if (provider === 'wechat') {
            const wechatProvider = createPaymentProvider('wechat')
            const success = await wechatProvider.closeOrder(orderId)
            if (success) return Response.json({ success: true, message: 'Order canceled successfully' })
            return Response.json({ error: 'Failed to cancel order' }, { status: 500 })
          } else if (provider === 'stripe') {
            return Response.json({ error: 'Canceling Stripe orders is not supported yet' }, { status: 501 })
          }
          return Response.json({ error: 'Unsupported payment provider' }, { status: 400 })
        } catch (error) {
          console.error('Error canceling order:', error)
          return Response.json({ error: 'An error occurred while canceling the order' }, { status: 500 })
        }
      }),
    },
  },
})
