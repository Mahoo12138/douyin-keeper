import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/orders')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { db } = await import('@libs/database')
          const { order } = await import('@libs/database/schema/order')
          const { eq, desc, sql } = await import('drizzle-orm')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

          const userId = session.user.id
          const url = new URL(request.url)
          const page = parseInt(url.searchParams.get('page') || '1', 10)
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 100)
          const offset = (page - 1) * limit

          const countResult = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(order)
            .where(eq(order.userId, userId))
          const total = countResult[0]?.count || 0

          const userOrders = await db
            .select({
              id: order.id,
              amount: order.amount,
              currency: order.currency,
              planId: order.planId,
              status: order.status,
              provider: order.provider,
              providerOrderId: order.providerOrderId,
              metadata: order.metadata,
              createdAt: order.createdAt,
              updatedAt: order.updatedAt,
            })
            .from(order)
            .where(eq(order.userId, userId))
            .orderBy(desc(order.createdAt))
            .limit(limit)
            .offset(offset)

          return Response.json({ orders: userOrders, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) })
        } catch (error) {
          console.error('Error fetching user orders:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),
    },
  },
})
