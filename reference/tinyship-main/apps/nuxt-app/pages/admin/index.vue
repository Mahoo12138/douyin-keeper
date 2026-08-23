<template>
  <div class="p-8 bg-background min-h-screen">
    <div class="max-w-7xl mx-auto">
      <!-- Header Section -->
      <div class="flex items-center justify-between mb-8">
        <h1 class="text-3xl font-bold text-foreground">{{ $t('admin.dashboard.title') }}</h1>
        <ClientOnly>
          <div class="text-sm text-muted-foreground">
            {{ $t('admin.dashboard.lastUpdated') }}: {{ formattedUpdateTime }}
          </div>
          <template #fallback>
            <div class="text-sm text-muted-foreground">
              {{ $t('admin.dashboard.lastUpdated') }}: --
            </div>
          </template>
        </ClientOnly>
      </div>
      
      <!-- Core Business Metrics - 4 Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <!-- Monthly Revenue -->
        <div class="relative p-6 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div class="absolute top-0 right-0 w-32 h-32 bg-chart-1/5 rounded-full blur-2xl -mr-10 -mt-10" />
          <div class="relative">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-medium text-muted-foreground">{{ $t('admin.dashboard.monthData.revenue') }}</h3>
              <div class="p-2.5 bg-muted rounded-xl">
                <Wallet class="w-5 h-5 text-foreground" />
              </div>
            </div>
            <p class="text-2xl font-bold text-card-foreground mb-1">¥{{ formatNumber(stats.monthData.revenue) }}</p>
            <div class="flex items-center text-sm">
              <TrendingUp v-if="stats.growthRates.revenue >= 0" class="w-4 h-4 text-chart-1 mr-1" />
              <TrendingDown v-else class="w-4 h-4 text-destructive mr-1" />
              <span :class="stats.growthRates.revenue >= 0 ? 'text-chart-1' : 'text-destructive'">
                {{ stats.growthRates.revenue >= 0 ? '+' : '' }}{{ stats.growthRates.revenue.toFixed(1) }}%
              </span>
              <span class="text-muted-foreground ml-1">{{ $t('admin.dashboard.metrics.fromLastMonth') }}</span>
            </div>
          </div>
        </div>

        <!-- Total Revenue -->
        <div class="relative p-6 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div class="absolute top-0 right-0 w-32 h-32 bg-chart-1/5 rounded-full blur-2xl -mr-10 -mt-10" />
          <div class="relative">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-medium text-muted-foreground">{{ $t('admin.dashboard.metrics.totalRevenue') }}</h3>
              <div class="p-2.5 bg-muted rounded-xl">
                <DollarSign class="w-5 h-5 text-foreground" />
              </div>
            </div>
            <p class="text-2xl font-bold text-card-foreground mb-1">¥{{ formatNumber(stats.revenue.total) }}</p>
            <p class="text-sm text-muted-foreground">{{ $t('admin.dashboard.metrics.totalRevenueDesc') }}</p>
          </div>
        </div>

        <!-- New Customers -->
        <div class="relative p-6 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div class="absolute top-0 right-0 w-32 h-32 bg-chart-1/5 rounded-full blur-2xl -mr-10 -mt-10" />
          <div class="relative">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-medium text-muted-foreground">{{ $t('admin.dashboard.metrics.newCustomers') }}</h3>
              <div class="p-2.5 bg-muted rounded-xl">
                <Users class="w-5 h-5 text-foreground" />
              </div>
            </div>
            <p class="text-2xl font-bold text-card-foreground mb-1">+{{ formatNumber(stats.customers.new) }}</p>
            <div class="flex items-center text-sm">
              <TrendingUp v-if="stats.growthRates.users >= 0" class="w-4 h-4 text-chart-1 mr-1" />
              <TrendingDown v-else class="w-4 h-4 text-destructive mr-1" />
              <span :class="stats.growthRates.users >= 0 ? 'text-chart-1' : 'text-destructive'">
                {{ stats.growthRates.users >= 0 ? '+' : '' }}{{ stats.growthRates.users.toFixed(1) }}%
              </span>
              <span class="text-muted-foreground ml-1">{{ $t('admin.dashboard.metrics.fromLastMonth') }}</span>
            </div>
          </div>
        </div>

        <!-- New Orders -->
        <div class="relative p-6 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div class="absolute top-0 right-0 w-32 h-32 bg-chart-1/5 rounded-full blur-2xl -mr-10 -mt-10" />
          <div class="relative">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-medium text-muted-foreground">{{ $t('admin.dashboard.metrics.newOrders') }}</h3>
              <div class="p-2.5 bg-muted rounded-xl">
                <ShoppingBag class="w-5 h-5 text-foreground" />
              </div>
            </div>
            <p class="text-2xl font-bold text-card-foreground mb-1">+{{ formatNumber(stats.orders.new) }}</p>
            <div class="flex items-center text-sm">
              <TrendingUp v-if="stats.growthRates.orders >= 0" class="w-4 h-4 text-chart-1 mr-1" />
              <TrendingDown v-else class="w-4 h-4 text-destructive mr-1" />
              <span :class="stats.growthRates.orders >= 0 ? 'text-chart-1' : 'text-destructive'">
                {{ stats.growthRates.orders >= 0 ? '+' : '' }}{{ stats.growthRates.orders.toFixed(1) }}%
              </span>
              <span class="text-muted-foreground ml-1">{{ $t('admin.dashboard.metrics.fromLastMonth') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Chart and Today's Data Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <!-- Monthly Revenue Trend Chart -->
        <div class="lg:col-span-2 bg-card p-6 rounded-xl border border-border">
          <h3 class="text-lg font-semibold text-card-foreground mb-2">{{ $t('admin.dashboard.chart.monthlyRevenueTrend') }}</h3>
          <ClientOnly>
            <LazyRevenueChart 
              :chart-data="stats.chartData"
              :labels="{
                revenue: $t('admin.dashboard.chart.revenue'),
                orders: $t('admin.dashboard.chart.orders')
              }"
            />
            <template #fallback>
              <div class="h-[300px] flex items-center justify-center border rounded-lg bg-muted/50">
                <div class="text-muted-foreground">Loading chart...</div>
              </div>
            </template>
          </ClientOnly>
        </div>

        <!-- Today's Data -->
        <div class="bg-card p-6 rounded-xl border border-border">
          <h3 class="text-lg font-semibold mb-6 text-card-foreground">{{ $t('admin.dashboard.todayData.title') }}</h3>
          <div class="space-y-6">
            <div>
              <p class="text-sm text-muted-foreground mb-1">{{ $t('admin.dashboard.todayData.revenue') }}</p>
              <p class="text-2xl font-bold text-card-foreground">¥{{ formatNumber(stats.todayData.revenue) }}</p>
            </div>
            <div class="h-px bg-border" />
            <div>
              <p class="text-sm text-muted-foreground mb-1">{{ $t('admin.dashboard.todayData.newUsers') }}</p>
              <p class="text-2xl font-bold text-card-foreground">{{ stats.todayData.newUsers }}</p>
            </div>
            <div class="h-px bg-border" />
            <div>
              <p class="text-sm text-muted-foreground mb-1">{{ $t('admin.dashboard.todayData.orders') }}</p>
              <p class="text-2xl font-bold text-card-foreground">{{ stats.todayData.orders }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Orders -->
      <div class="bg-card rounded-xl border border-border overflow-hidden">
        <AdminOrdersCard :limit="10" />
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { DollarSign, Users, ShoppingBag, TrendingUp, TrendingDown, Wallet } from 'lucide-vue-next'

// Define metadata for layout
definePageMeta({
  layout: 'admin'
})

// Composables  
const { t, locale } = useI18n()

// SEO
useHead({
  title: computed(() => t('admin.dashboard.title'))
})

// Define types for admin statistics with growth rates
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
  chartData: Array<{
    month: string
    revenue: number
    orders: number
  }>
}


// Reactive data
const stats = ref<AdminStats>({
  revenue: { total: 0 },
  customers: { new: 0 },
  orders: { new: 0 },
  todayData: { revenue: 0, newUsers: 0, orders: 0 },
  monthData: { revenue: 0, newUsers: 0, orders: 0 },
  lastMonthData: { revenue: 0, newUsers: 0, orders: 0 },
  growthRates: { revenue: 0, users: 0, orders: 0 },
  chartData: []
})

const loading = ref(true)
const error = ref<string | null>(null)

// Computed properties
const formattedUpdateTime = computed(() => {
  return new Date().toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US')
})

// Helper functions
const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

// Fetch admin statistics
const fetchAdminStats = async () => {
  try {
    loading.value = true
    error.value = null
    
    const response = await $fetch<AdminStats>('/api/admin/stats')
    stats.value = response
  } catch (err) {
    console.error('Failed to fetch admin stats:', err)
    error.value = 'Failed to fetch admin statistics'
    
    // Fallback to demo data for development
    stats.value = {
      revenue: { total: 125000 },
      customers: { new: 48 },
      orders: { new: 73 },
      todayData: { revenue: 2500, newUsers: 5, orders: 8 },
      monthData: { revenue: 35000, newUsers: 48, orders: 73 },
      lastMonthData: { revenue: 30000, newUsers: 40, orders: 65 },
      growthRates: { revenue: 16.7, users: 20.0, orders: 12.3 },
      chartData: []
    }
  } finally {
    loading.value = false
  }
}

// Load data on mount
onMounted(() => {
  fetchAdminStats()
})
</script>
