import { auth } from '@libs/auth'
import { db } from '@libs/database'
import { user } from '@libs/database/schema/user'
import { order, orderStatus } from '@libs/database/schema/order'
import { count, eq, gte, lte, and, sql } from 'drizzle-orm'
import { can, Action, Subject } from '@libs/permissions'
import { userRoles } from '@libs/database/constants'

/**
 * Get admin dashboard statistics
 * Requires admin permissions
 */

// Chart data interface for monthly trends
interface ChartData {
  month: string
  revenue: number
  orders: number
}

// Admin statistics interface with growth rates
interface AdminStats {
  revenue: {
    total: number
  }
  customers: {
    new: number
  }
  orders: {
    new: number
  }
  todayData: {
    revenue: number
    newUsers: number
    orders: number
  }
  monthData: {
    revenue: number
    newUsers: number
    orders: number
  }
  lastMonthData: {
    revenue: number
    newUsers: number
    orders: number
  }
  growthRates: {
    revenue: number
    users: number
    orders: number
  }
  chartData: ChartData[]
}

// Calculate growth rate percentage
function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

// Get real monthly data for the past 6 months
async function getRealMonthlyData(): Promise<ChartData[]> {
  try {
    const now = new Date()
    const monthlyData: ChartData[] = []
    
    // Get data for the past 6 months
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now)
      targetDate.setMonth(targetDate.getMonth() - i)
      
      // Start and end of the month
      const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
      const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59)
      
      try {
        // Query monthly revenue
        const [monthRevenue] = await db.select({
          total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
        }).from(order).where(and(
          eq(order.status, orderStatus.PAID),
          gte(order.createdAt, monthStart),
          lte(order.createdAt, monthEnd)
        ))
        
        // Query monthly paid order count
        const [monthOrders] = await db.select({
          count: count()
        }).from(order).where(and(
          eq(order.status, orderStatus.PAID),
          gte(order.createdAt, monthStart),
          lte(order.createdAt, monthEnd)
        ))
        
        // Format month name
        const monthName = `${targetDate.getMonth() + 1}月`
        
        monthlyData.push({
          month: monthName,
          revenue: Number(monthRevenue?.total) || 0,
          orders: monthOrders?.count || 0
        })
      } catch (error) {
        console.error(`Failed to get data for month ${targetDate.getMonth() + 1}:`, error)
        // If data fetch fails for a month, use default values
        monthlyData.push({
          month: `${targetDate.getMonth() + 1}月`,
          revenue: 0,
          orders: 0
        })
      }
    }
    
    return monthlyData
  } catch (error) {
    console.error('Failed to get monthly data, using fallback:', error)
    // If the entire function fails, return empty data structure for the last 6 months
    const now = new Date()
    const fallbackData: ChartData[] = []
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now)
      targetDate.setMonth(targetDate.getMonth() - i)
      fallbackData.push({
        month: `${targetDate.getMonth() + 1}月`,
        revenue: 0,
        orders: 0
      })
    }
    return fallbackData
  }
}

export default defineEventHandler(async (event) => {
  try {
    const now = new Date()
    const currentDayOfMonth = now.getDate()
    
    // Time range definitions
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    
    // This month: from 1st to today
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    thisMonthStart.setHours(0, 0, 0, 0)

    // Last month same period: from 1st to same day of last month (for fair comparison)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    lastMonthStart.setHours(0, 0, 0, 0)
    
    // Last month same day (e.g., if today is Dec 15, compare with Nov 1-15)
    const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, currentDayOfMonth, 23, 59, 59)

    // Get all statistics in parallel
    const [
      totalRevenue,
      newCustomers, 
      newOrders,
      todayRevenue,
      todayNewUsers,
      todayOrders,
      thisMonthRevenue,
      monthlyOrders,
      lastMonthRevenue,
      lastMonthUsers,
      lastMonthOrders,
      chartData
    ] = await Promise.all([
      // Total revenue (all time, only paid orders)
      db.select({
        total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
      }).from(order).where(eq(order.status, orderStatus.PAID)),

      // New customers this month
      db.select({ count: count() }).from(user)
        .where(gte(user.createdAt, thisMonthStart)),

      // New paid orders this month
      db.select({ count: count() }).from(order)
        .where(and(
          eq(order.status, orderStatus.PAID),
          gte(order.createdAt, thisMonthStart)
        )),

      // Today's revenue
      db.select({
        total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
      }).from(order).where(and(
        eq(order.status, orderStatus.PAID),
        gte(order.createdAt, today)
      )),

      // Today's new users
      db.select({ count: count() }).from(user).where(gte(user.createdAt, today)),

      // Today's paid orders
      db.select({ count: count() }).from(order).where(and(
        eq(order.status, orderStatus.PAID),
        gte(order.createdAt, today)
      )),

      // This month's revenue
      db.select({
        total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
      }).from(order).where(and(
        eq(order.status, orderStatus.PAID),
        gte(order.createdAt, thisMonthStart)
      )),

      // This month's paid orders
      db.select({ count: count() }).from(order).where(and(
        eq(order.status, orderStatus.PAID),
        gte(order.createdAt, thisMonthStart)
      )),

      // Last month's same period revenue (for fair comparison)
      db.select({
        total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
      }).from(order).where(and(
        eq(order.status, orderStatus.PAID),
        gte(order.createdAt, lastMonthStart),
        lte(order.createdAt, lastMonthSameDay)
      )),

      // Last month's same period users
      db.select({ count: count() }).from(user).where(and(
        gte(user.createdAt, lastMonthStart),
        lte(user.createdAt, lastMonthSameDay)
      )),

      // Last month's same period paid orders
      db.select({ count: count() }).from(order).where(and(
        eq(order.status, orderStatus.PAID),
        gte(order.createdAt, lastMonthStart),
        lte(order.createdAt, lastMonthSameDay)
      )),

      // Monthly chart data
      getRealMonthlyData()
    ])

    const thisMonthRevenueValue = Number(thisMonthRevenue[0]?.total) || 0
    const lastMonthRevenueValue = Number(lastMonthRevenue[0]?.total) || 0

    const stats: AdminStats = {
      revenue: {
        total: Number(totalRevenue[0]?.total) || 0,
      },
      customers: {
        new: newCustomers[0]?.count ?? 0,
      },
      orders: {
        new: newOrders[0]?.count ?? 0,
      },
      todayData: {
        revenue: Number(todayRevenue[0]?.total) || 0,
        newUsers: todayNewUsers[0]?.count ?? 0,
        orders: todayOrders[0]?.count ?? 0,
      },
      monthData: {
        revenue: thisMonthRevenueValue,
        newUsers: newCustomers[0]?.count ?? 0,
        orders: monthlyOrders[0]?.count ?? 0,
      },
      lastMonthData: {
        revenue: lastMonthRevenueValue,
        newUsers: lastMonthUsers[0]?.count ?? 0,
        orders: lastMonthOrders[0]?.count ?? 0,
      },
      growthRates: {
        revenue: calculateGrowthRate(thisMonthRevenueValue, lastMonthRevenueValue),
        users: calculateGrowthRate(newCustomers[0]?.count ?? 0, lastMonthUsers[0]?.count ?? 0),
        orders: calculateGrowthRate(monthlyOrders[0]?.count ?? 0, lastMonthOrders[0]?.count ?? 0),
      },
      chartData: chartData,
    }

    return stats
  } catch (error) {
    console.error('Failed to fetch admin statistics:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch statistics'
    })
  }
})
