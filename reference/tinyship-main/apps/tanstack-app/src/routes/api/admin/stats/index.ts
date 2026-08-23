import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

export const Route = createFileRoute('/api/admin/stats/')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { userRoles } = await import('@libs/database/constants')
          const { db } = await import('@libs/database')
          const { user } = await import('@libs/database/schema/user')
          const { order, orderStatus } = await import('@libs/database/schema/order')
          const { eq, gte, lte, and, sql, count } = await import('drizzle-orm')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user?.id || session.user.role !== userRoles.ADMIN) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
          }

          const now = new Date()
          const currentDayOfMonth = now.getDate()

          const today = new Date(now)
          today.setHours(0, 0, 0, 0)

          const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
          thisMonthStart.setHours(0, 0, 0, 0)

          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          lastMonthStart.setHours(0, 0, 0, 0)

          const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, currentDayOfMonth, 23, 59, 59)

          const paidFilter = eq(order.status, orderStatus.PAID)

          const [totalRevenue] = await db.select({
            total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
          }).from(order).where(paidFilter)

          const [todayRevenue] = await db.select({
            total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
          }).from(order).where(and(paidFilter, gte(order.createdAt, today)))

          const [thisMonthRevenue] = await db.select({
            total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
          }).from(order).where(and(paidFilter, gte(order.createdAt, thisMonthStart)))

          const [lastMonthRevenue] = await db.select({
            total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
          }).from(order).where(and(paidFilter, gte(order.createdAt, lastMonthStart), lte(order.createdAt, lastMonthSameDay)))

          const [todayOrders] = await db.select({ count: count() }).from(order)
            .where(and(paidFilter, gte(order.createdAt, today)))

          const [thisMonthOrders] = await db.select({ count: count() }).from(order)
            .where(and(paidFilter, gte(order.createdAt, thisMonthStart)))

          const [lastMonthOrders] = await db.select({ count: count() }).from(order)
            .where(and(paidFilter, gte(order.createdAt, lastMonthStart), lte(order.createdAt, lastMonthSameDay)))

          const [thisMonthUsers] = await db.select({ count: count() }).from(user)
            .where(gte(user.createdAt, thisMonthStart))

          const [todayUsers] = await db.select({ count: count() }).from(user)
            .where(gte(user.createdAt, today))

          const [lastMonthUsers] = await db.select({ count: count() }).from(user)
            .where(and(gte(user.createdAt, lastMonthStart), lte(user.createdAt, lastMonthSameDay)))

          const thisMonthRevenueValue = Number(thisMonthRevenue.total) || 0
          const lastMonthRevenueValue = Number(lastMonthRevenue.total) || 0
          const thisMonthUsersValue = thisMonthUsers.count ?? 0
          const lastMonthUsersValue = lastMonthUsers.count ?? 0
          const thisMonthOrdersValue = thisMonthOrders.count ?? 0
          const lastMonthOrdersValue = lastMonthOrders.count ?? 0

          return Response.json({
            revenue: { total: Number(totalRevenue.total) || 0 },
            customers: { new: thisMonthUsersValue },
            orders: { new: thisMonthOrdersValue },
            todayData: {
              revenue: Number(todayRevenue.total) || 0,
              newUsers: todayUsers.count ?? 0,
              orders: todayOrders.count ?? 0,
            },
            monthData: {
              revenue: thisMonthRevenueValue,
              newUsers: thisMonthUsersValue,
              orders: thisMonthOrdersValue,
            },
            lastMonthData: {
              revenue: lastMonthRevenueValue,
              newUsers: lastMonthUsersValue,
              orders: lastMonthOrdersValue,
            },
            growthRates: {
              revenue: calculateGrowthRate(thisMonthRevenueValue, lastMonthRevenueValue),
              users: calculateGrowthRate(thisMonthUsersValue, lastMonthUsersValue),
              orders: calculateGrowthRate(thisMonthOrdersValue, lastMonthOrdersValue),
            },
          })
        } catch (error) {
          console.error('Error fetching admin stats:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),
    },
  },
})
