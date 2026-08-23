import { createFileRoute } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import { DollarSign, Users, ShoppingBag, Loader2, TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AdminOrdersCard } from '@/components/admin/admin-orders-card'

export const Route = createFileRoute('/$lang/admin/')({
  head: ({ params }) => seoHead(params.lang, (t) => t.admin.metadata),
  component: AdminDashboard,
})

interface AdminStats {
  revenue: { total: number }
  customers: { new: number }
  orders: { new: number }
  todayData: { revenue: number; newUsers: number; orders: number }
  monthData: { revenue: number; newUsers: number; orders: number }
  lastMonthData: { revenue: number; newUsers: number; orders: number }
  growthRates: { revenue: number; users: number; orders: number }
}

interface ChartData {
  month: string
  revenue: number
  orders: number
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

// Inline revenue chart component
function RevenueChart({ data, labels }: { data: ChartData[]; labels: { revenue: string; orders: string } }) {
  const [isClient, setIsClient] = useState(false)
  const [activeTab, setActiveTab] = useState<'revenue' | 'orders'>('revenue')

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <div className="h-80 flex items-center justify-center bg-muted/30 rounded-lg">
        <div className="animate-pulse">
          <div className="h-4 bg-muted-foreground/30 rounded w-32 mx-auto mb-2"></div>
          <div className="h-3 bg-muted-foreground/20 rounded w-24 mx-auto"></div>
        </div>
      </div>
    )
  }

  const getComputedColor = (variable: string) => {
    if (typeof window === 'undefined') return '#000'
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  }

  const chart1Color = getComputedColor('--chart-1')
  const borderColor = getComputedColor('--border')
  const mutedForegroundColor = getComputedColor('--muted-foreground')

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const value = payload[0]?.value ?? 0
      return (
        <div className="bg-card p-3 border border-border rounded-lg shadow-lg">
          <p className="text-sm font-medium text-card-foreground">{label}</p>
          <p className="text-sm text-chart-1">
            {activeTab === 'revenue' ? `¥${value.toLocaleString()}` : value.toLocaleString()}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <div className="inline-flex items-center p-1 bg-muted rounded-lg">
          <button
            onClick={() => setActiveTab('revenue')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
              activeTab === 'revenue'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {labels.revenue}
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
              activeTab === 'orders'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {labels.orders}
          </button>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorChart" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chart1Color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chart1Color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={borderColor} vertical={false} />
            <XAxis
              dataKey="month"
              stroke={mutedForegroundColor}
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke={mutedForegroundColor}
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => activeTab === 'revenue' ? `¥${formatNumber(value)}` : formatNumber(value)}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey={activeTab}
              stroke={chart1Color}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorChart)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function AdminDashboard() {
  const { t, locale } = useTranslation()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [monthlyData, setMonthlyData] = useState<ChartData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, monthlyRes] = await Promise.all([
          fetch('/api/admin/stats'),
          fetch('/api/admin/stats/monthly'),
        ])

        if (statsRes.ok) {
          const data = await statsRes.json()
          setStats(data)
        }
        if (monthlyRes.ok) {
          const data = await monthlyRes.json()
          setMonthlyData(data)
        }
      } catch (err) {
        console.error('Failed to fetch admin stats', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading || !stats) {
    return (
      <div className="p-8 bg-background min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-chart-1 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{t.admin.dashboard.title}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t.admin.dashboard.title}</h1>
          <div className="text-sm text-muted-foreground">
            {t.admin.dashboard.lastUpdated}: {new Date().toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')}
          </div>
        </div>

        {/* Core Business Metrics */}
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

        {/* Chart and Today's Data */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-card p-6 rounded-xl border border-border">
            <h3 className="text-lg font-semibold text-card-foreground mb-2">{t.admin.dashboard.chart.monthlyRevenueTrend}</h3>
            <RevenueChart
              data={monthlyData}
              labels={{
                revenue: t.admin.dashboard.chart.revenue,
                orders: t.admin.dashboard.chart.orders,
              }}
            />
          </div>

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
  )
}
