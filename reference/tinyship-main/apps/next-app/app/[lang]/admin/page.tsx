import { headers } from 'next/headers'
import { auth } from "@libs/auth";
import { userRoles } from "@libs/database/constants";
import { db } from "@libs/database";
import { user } from "@libs/database/schema/user";
import { order, orderStatus } from "@libs/database/schema/order";
import { count, eq, gte, lte, and, sql, desc, lt } from "drizzle-orm";
import { config } from "@config";
import dynamic from 'next/dynamic';
import { translations } from "@libs/i18n";
import { DollarSign, Users, ShoppingBag, Loader2, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { AdminOrdersCard } from "./components/admin-orders-card";

// 定义图表数据类型
interface ChartData {
  month: string;
  revenue: number;
  orders: number;
}

// 动态导入 recharts 图表组件
const RevenueChart = dynamic(() => import('./RevenueChart'), { 
  loading: () => (
    <div className="h-80 flex items-center justify-center bg-muted rounded-lg">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-chart-1 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">加载图表中...</p>
      </div>
    </div>
  )
});

// Statistics data type definition with growth rates
interface AdminStats {
  revenue: {
    total: number;
  };
  customers: {
    new: number; // This month's new customers
  };
  orders: {
    new: number; // This month's new orders
  };
  todayData: {
    revenue: number;
    newUsers: number;
    orders: number;
  };
  monthData: {
    revenue: number;
    newUsers: number;
    orders: number;
  };
  lastMonthData: {
    revenue: number;
    newUsers: number;
    orders: number;
  };
  growthRates: {
    revenue: number; // Percentage growth compared to last month
    users: number;
    orders: number;
  };
}

// Get real monthly revenue trend data (past 6 months)

async function getRealMonthlyData(): Promise<ChartData[]> {
  try {
    const now = new Date();
    const monthlyData: ChartData[] = [];
    
    // 获取过去6个月的数据
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now);
      targetDate.setMonth(targetDate.getMonth() - i);
      
      // 该月的开始和结束时间
      const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);
      
      try {
        // 查询该月的收入总额
        const [monthRevenue] = await db.select({
          total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
        }).from(order).where(and(
          eq(order.status, orderStatus.PAID),
          gte(order.createdAt, monthStart),
          lte(order.createdAt, monthEnd)
        ));
        
        // 查询该月的已支付订单数量
        const [monthOrders] = await db.select({
          count: count()
        }).from(order).where(and(
          eq(order.status, orderStatus.PAID),
          gte(order.createdAt, monthStart),
          lte(order.createdAt, monthEnd)
        ));
        
        // 格式化月份显示 - 使用更简洁的格式
        const monthName = `${targetDate.getMonth() + 1}月`;
        
        monthlyData.push({
          month: monthName,
          revenue: Number(monthRevenue.total) || 0,
          orders: monthOrders.count || 0
        });
      } catch (error) {
        console.error(`获取${targetDate.getMonth() + 1}月数据失败:`, error);
        // 如果某个月数据获取失败，使用默认值
        monthlyData.push({
          month: `${targetDate.getMonth() + 1}月`,
          revenue: 0,
          orders: 0
        });
      }
    }
    
    return monthlyData;
  } catch (error) {
    console.error('获取月度数据失败，使用默认数据:', error);
    // 如果整个函数失败，返回最近6个月的空数据结构
    const now = new Date();
    const fallbackData: ChartData[] = [];
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now);
      targetDate.setMonth(targetDate.getMonth() - i);
      fallbackData.push({
        month: `${targetDate.getMonth() + 1}月`,
        revenue: 0,
        orders: 0
      });
    }
    return fallbackData;
  }
}

// Calculate growth rate percentage
function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// Get admin statistics with growth rates
async function getAdminStats(): Promise<AdminStats> {
  const now = new Date();
  const currentDayOfMonth = now.getDate();
  
  // Time range definitions
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  
  // This month: from 1st to today
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  thisMonthStart.setHours(0, 0, 0, 0);

  // Last month same period: from 1st to same day of last month (for fair comparison)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  lastMonthStart.setHours(0, 0, 0, 0);
  
  // Last month same day (e.g., if today is Dec 15, compare with Nov 1-15)
  const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, currentDayOfMonth, 23, 59, 59);

  // Total revenue (all time, only paid orders)
  const [totalRevenue] = await db.select({
    total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
  }).from(order).where(eq(order.status, orderStatus.PAID));

  // This month's new customers
  const [newCustomers] = await db.select({ count: count() }).from(user)
    .where(gte(user.createdAt, thisMonthStart));

  // This month's paid orders (only count successful payments)
  const [newOrders] = await db.select({ count: count() }).from(order)
    .where(and(
      eq(order.status, orderStatus.PAID),
      gte(order.createdAt, thisMonthStart)
    ));

  // Today's data
  const [todayRevenue] = await db.select({
    total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
  }).from(order).where(and(
    eq(order.status, orderStatus.PAID),
    gte(order.createdAt, today)
  ));

  const [todayNewUsers] = await db.select({ count: count() }).from(user).where(gte(user.createdAt, today));
  
  // Today's paid orders only
  const [todayOrders] = await db.select({ count: count() }).from(order).where(and(
    eq(order.status, orderStatus.PAID),
    gte(order.createdAt, today)
  ));

  // This month's revenue (only paid orders)
  const [thisMonthRevenue] = await db.select({
    total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
  }).from(order).where(and(
    eq(order.status, orderStatus.PAID),
    gte(order.createdAt, thisMonthStart)
  ));

  // This month's paid orders count
  const [monthlyOrders] = await db.select({ count: count() }).from(order).where(and(
    eq(order.status, orderStatus.PAID),
    gte(order.createdAt, thisMonthStart)
  ));

  // Last month's same period data for fair comparison (e.g., Nov 1-15 vs Dec 1-15)
  const [lastMonthRevenue] = await db.select({
    total: sql<number>`COALESCE(SUM(CAST(${order.amount} AS DECIMAL)), 0)`
  }).from(order).where(and(
    eq(order.status, orderStatus.PAID),
    gte(order.createdAt, lastMonthStart),
    lte(order.createdAt, lastMonthSameDay)
  ));

  const [lastMonthUsers] = await db.select({ count: count() }).from(user).where(and(
    gte(user.createdAt, lastMonthStart),
    lte(user.createdAt, lastMonthSameDay)
  ));

  const [lastMonthOrders] = await db.select({ count: count() }).from(order).where(and(
    eq(order.status, orderStatus.PAID),
    gte(order.createdAt, lastMonthStart),
    lte(order.createdAt, lastMonthSameDay)
  ));

  const thisMonthRevenueValue = Number(thisMonthRevenue.total) || 0;
  const lastMonthRevenueValue = Number(lastMonthRevenue.total) || 0;

  return {
    revenue: {
      total: Number(totalRevenue.total) || 0,
    },
    customers: {
      new: newCustomers.count,
    },
    orders: {
      new: newOrders.count,
    },
    todayData: {
      revenue: Number(todayRevenue.total) || 0,
      newUsers: todayNewUsers.count,
      orders: todayOrders.count,
    },
    monthData: {
      revenue: thisMonthRevenueValue,
      newUsers: newCustomers.count,
      orders: monthlyOrders.count,
    },
    lastMonthData: {
      revenue: lastMonthRevenueValue,
      newUsers: lastMonthUsers.count,
      orders: lastMonthOrders.count,
    },
    growthRates: {
      revenue: calculateGrowthRate(thisMonthRevenueValue, lastMonthRevenueValue),
      users: calculateGrowthRate(newCustomers.count, lastMonthUsers.count),
      orders: calculateGrowthRate(monthlyOrders.count, lastMonthOrders.count),
    },
  };
}



// 格式化数字显示
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export default async function AdminDashboard({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations];

  const session = await auth.api.getSession({
    headers: await headers()
  });

  // 权限检查
  if (!session || session.user.role !== userRoles.ADMIN) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">{t.admin.dashboard.accessDenied}</h1>
          <p className="text-muted-foreground">{t.admin.dashboard.noPermission}</p>
        </div>
      </div>
    );
  }

  // Fetch statistics data
  const stats = await getAdminStats();
  
  // Fetch real monthly data for chart
  const monthlyData = await getRealMonthlyData();

  return (
    <div className="p-8 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t.admin.dashboard.title}</h1>
          <div className="text-sm text-muted-foreground">
            {t.admin.dashboard.lastUpdated}: {new Date().toLocaleString(lang === 'zh-CN' ? 'zh-CN' : 'en-US')}
          </div>
        </div>
        
        {/* Core Business Metrics - 4 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Monthly Revenue */}
          <div className="relative p-6 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-chart-1/5 rounded-full blur-2xl -mr-10 -mt-10" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t.admin.dashboard.monthData.revenue}</h3>
                <div className="p-2.5 bg-muted rounded-xl">
                  <Wallet className="w-5 h-5 text-foreground" />
                </div>
              </div>
              <p className="text-2xl font-bold text-card-foreground mb-1">¥{formatNumber(stats.monthData.revenue)}</p>
              <div className="flex items-center text-sm">
                {stats.growthRates.revenue >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-chart-1 mr-1" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-destructive mr-1" />
                )}
                <span className={stats.growthRates.revenue >= 0 ? "text-chart-1" : "text-destructive"}>
                  {stats.growthRates.revenue >= 0 ? "+" : ""}{stats.growthRates.revenue.toFixed(1)}%
                </span>
                <span className="text-muted-foreground ml-1">{t.admin.dashboard.metrics.fromLastMonth}</span>
              </div>
            </div>
          </div>

          {/* Total Revenue */}
          <div className="relative p-6 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-chart-1/5 rounded-full blur-2xl -mr-10 -mt-10" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t.admin.dashboard.metrics.totalRevenue}</h3>
                <div className="p-2.5 bg-muted rounded-xl">
                  <DollarSign className="w-5 h-5 text-foreground" />
                </div>
              </div>
              <p className="text-2xl font-bold text-card-foreground mb-1">¥{formatNumber(stats.revenue.total)}</p>
              <p className="text-sm text-muted-foreground">{t.admin.dashboard.metrics.totalRevenueDesc}</p>
            </div>
          </div>

          {/* New Customers */}
          <div className="relative p-6 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-chart-1/5 rounded-full blur-2xl -mr-10 -mt-10" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t.admin.dashboard.metrics.newCustomers}</h3>
                <div className="p-2.5 bg-muted rounded-xl">
                  <Users className="w-5 h-5 text-foreground" />
                </div>
              </div>
              <p className="text-2xl font-bold text-card-foreground mb-1">+{formatNumber(stats.customers.new)}</p>
              <div className="flex items-center text-sm">
                {stats.growthRates.users >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-chart-1 mr-1" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-destructive mr-1" />
                )}
                <span className={stats.growthRates.users >= 0 ? "text-chart-1" : "text-destructive"}>
                  {stats.growthRates.users >= 0 ? "+" : ""}{stats.growthRates.users.toFixed(1)}%
                </span>
                <span className="text-muted-foreground ml-1">{t.admin.dashboard.metrics.fromLastMonth}</span>
              </div>
            </div>
          </div>

          {/* New Orders */}
          <div className="relative p-6 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-chart-1/5 rounded-full blur-2xl -mr-10 -mt-10" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t.admin.dashboard.metrics.newOrders}</h3>
                <div className="p-2.5 bg-muted rounded-xl">
                  <ShoppingBag className="w-5 h-5 text-foreground" />
                </div>
              </div>
              <p className="text-2xl font-bold text-card-foreground mb-1">+{formatNumber(stats.orders.new)}</p>
              <div className="flex items-center text-sm">
                {stats.growthRates.orders >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-chart-1 mr-1" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-destructive mr-1" />
                )}
                <span className={stats.growthRates.orders >= 0 ? "text-chart-1" : "text-destructive"}>
                  {stats.growthRates.orders >= 0 ? "+" : ""}{stats.growthRates.orders.toFixed(1)}%
                </span>
                <span className="text-muted-foreground ml-1">{t.admin.dashboard.metrics.fromLastMonth}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart and Today's Data Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Monthly Revenue Trend Chart */}
          <div className="lg:col-span-2 bg-card p-6 rounded-xl border border-border">
            <h3 className="text-lg font-semibold text-card-foreground mb-2">{t.admin.dashboard.chart.monthlyRevenueTrend}</h3>
            <RevenueChart 
              data={monthlyData} 
              labels={{
                revenue: t.admin.dashboard.chart.revenue,
                orders: t.admin.dashboard.chart.orders
              }}
            />
          </div>

          {/* Today's Data */}
          <div className="bg-card p-6 rounded-xl border border-border">
            <h3 className="text-lg font-semibold mb-6 text-card-foreground">{t.admin.dashboard.todayData.title}</h3>
            <div className="space-y-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t.admin.dashboard.todayData.revenue}</p>
                <p className="text-2xl font-bold text-card-foreground">¥{formatNumber(stats.todayData.revenue)}</p>
              </div>
              <div className="h-px bg-border" />
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t.admin.dashboard.todayData.newUsers}</p>
                <p className="text-2xl font-bold text-card-foreground">{stats.todayData.newUsers}</p>
              </div>
              <div className="h-px bg-border" />
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t.admin.dashboard.todayData.orders}</p>
                <p className="text-2xl font-bold text-card-foreground">{stats.todayData.orders}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <AdminOrdersCard limit={10} />
        </div>
      </div>
    </div>
  );
}
