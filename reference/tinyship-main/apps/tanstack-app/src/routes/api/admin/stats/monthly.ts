import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/stats/monthly')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { userRoles } = await import('@libs/database/constants')
          const { db } = await import('@libs/database')
          const { order, orderStatus } = await import('@libs/database/schema/order')
          const { eq, gte, lte, and, sql, count } = await import('drizzle-orm')
          const { isSqliteDialect } = await import('@libs/database/shared/dialect')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user?.id || session.user.role !== userRoles.ADMIN) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
          }

          const now = new Date()
          const monthlyData: Array<{ month: string; revenue: number; orders: number }> = []

          const acceptLang = request.headers.get('accept-language') || ''
          const isZh = acceptLang.includes('zh')

          const isSqlite = isSqliteDialect()

          for (let i = 5; i >= 0; i--) {
            const targetDate = new Date(now)
            targetDate.setMonth(targetDate.getMonth() - i)

            const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
            const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59)

            const [monthRevenue] = await db.select({
              total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`,
            }).from(order).where(and(
              eq(order.status, orderStatus.PAID),
              gte(order.createdAt, monthStart),
              lte(order.createdAt, monthEnd),
            ))

            const [monthOrders] = await db.select({ count: count() }).from(order).where(and(
              eq(order.status, orderStatus.PAID),
              gte(order.createdAt, monthStart),
              lte(order.createdAt, monthEnd),
            ))

            const monthLabel = isZh
              ? `${targetDate.getMonth() + 1}月`
              : targetDate.toLocaleString('en-US', { month: 'short' })

            monthlyData.push({
              month: monthLabel,
              revenue: Number(monthRevenue?.total) || 0,
              orders: monthOrders?.count ?? 0,
            })
          }

          return Response.json(monthlyData)
        } catch (error) {
          console.error('Error fetching monthly stats:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),
    },
  },
})
