<template>
  <Card class="shadow-sm">
    <div class="p-6 border-b border-border flex items-center justify-between">
      <h3 class="text-lg font-semibold text-card-foreground flex items-center gap-2">
        <ShoppingCart class="h-5 w-5" />
        {{ $t('dashboard.orders.title') }}
      </h3>
      <div class="text-sm text-muted-foreground">
        {{ $t('admin.dashboard.recentOrders.total') }}: {{ total }}
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="pending" class="p-6">
      <div class="animate-pulse">
        <div class="h-4 bg-muted rounded w-32 mb-2"></div>
        <div class="h-4 bg-muted rounded w-48"></div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="p-6">
      <div class="text-destructive text-sm">
        {{ $t('common.error') }}
      </div>
    </div>

    <!-- No Data State -->
    <div v-else-if="!ordersData || ordersData.length === 0" class="p-6">
      <p class="text-muted-foreground text-center">
        {{ $t('dashboard.orders.noOrdersDescription') }}
      </p>
    </div>

    <!-- Orders Table -->
    <div v-else class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-muted">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {{ $t('admin.dashboard.recentOrders.orderId') }}
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {{ $t('admin.dashboard.recentOrders.customer') }}
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {{ $t('admin.dashboard.recentOrders.plan') }}
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {{ $t('admin.dashboard.recentOrders.amount') }}
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {{ $t('admin.dashboard.recentOrders.provider') }}
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {{ $t('admin.dashboard.recentOrders.status') }}
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {{ $t('admin.dashboard.recentOrders.time') }}
            </th>
          </tr>
        </thead>
        <tbody class="bg-card divide-y divide-border">
          <tr v-for="order in ordersData" :key="order.id" class="hover:bg-muted/50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-card-foreground">
              #{{ order.id.slice(-8) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
              <div class="flex items-center gap-2">
                <User class="h-4 w-4" />
                <div>
                  <div class="font-medium text-card-foreground">
                    {{ order.userName || 'N/A' }}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    {{ order.userEmail }}
                  </div>
                </div>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
              {{ getPlanName(order.planId) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-card-foreground">
              {{ formatAmount(order.amount, order.currency) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground capitalize">
              {{ getProviderDisplay(order.provider) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <Badge :variant="getOrderStatusDisplay(order.status).variant">
                <component :is="getOrderStatusDisplay(order.status).icon" class="h-3 w-3 mr-1" />
                {{ getOrderStatusDisplay(order.status).text }}
              </Badge>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
              {{ order.createdAt ? formatDate(order.createdAt) : 'N/A' }}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- View All Button -->
      <div class="p-6 border-t border-border">
        <Button variant="outline" as-child class="w-full">
          <NuxtLink :to="localePath('/admin/orders')">
            {{ $t('dashboard.orders.viewAllOrders') }}
            <ExternalLink class="ml-2 h-4 w-4" />
          </NuxtLink>
        </Button>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { 
  ShoppingCart, 
  Calendar, 
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  User
} from 'lucide-vue-next'
import { config } from '@config'
import type { BadgeVariants } from '@/components/ui/badge'

interface AdminOrder {
  id: string
  userId: string
  amount: string
  currency: string
  planId: string
  status: string
  provider: string
  providerOrderId?: string | null
  metadata?: any
  createdAt: string | Date
  updatedAt?: string | Date
  userName?: string | null
  userEmail?: string | null
}

interface Props {
  limit?: number
}

const props = withDefaults(defineProps<Props>(), {
  limit: 10
})

const { t, locale } = useI18n()
const localePath = useLocalePath()

// Fetch orders data
const { data, pending, error } = await useFetch('/api/admin/orders', {
  query: {
    limit: props.limit,
    offset: 0
  },
  server: false
})

const ordersData = computed(() => data.value?.orders || [])
const total = computed(() => data.value?.total || 0)

// Format date
const formatDate = (dateString: string | Date) => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  return date.toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Format amount
const formatAmount = (amount: string, currency: string) => {
  const numAmount = parseFloat(amount)
  return `${currency === 'CNY' ? '¥' : '$'}${numAmount.toLocaleString()}`
}

// Get plan name
const getPlanName = (planId: string) => {
  const plan = config.payment.plans[planId as keyof typeof config.payment.plans]
  return plan?.i18n[locale.value]?.name || planId
}

// Get order status display
const getOrderStatusDisplay = (status: string) => {
  switch (status) {
    case 'paid':
      return {
        text: t('dashboard.orders.status.paid'),
        variant: 'default' as BadgeVariants['variant'],
        icon: CheckCircle
      }
    case 'pending':
      return {
        text: t('dashboard.orders.status.pending'),
        variant: 'secondary' as BadgeVariants['variant'],
        icon: Clock
      }
    case 'failed':
      return {
        text: t('dashboard.orders.status.failed'),
        variant: 'destructive' as BadgeVariants['variant'],
        icon: XCircle
      }
    case 'refunded':
      return {
        text: t('dashboard.orders.status.refunded'),
        variant: 'outline' as BadgeVariants['variant'],
        icon: RotateCcw
      }
    case 'canceled':
      return {
        text: t('dashboard.orders.status.canceled'),
        variant: 'secondary' as BadgeVariants['variant'],
        icon: XCircle
      }
    default:
      return {
        text: status,
        variant: 'outline' as BadgeVariants['variant'],
        icon: AlertCircle
      }
  }
}

// Get provider display
const getProviderDisplay = (provider: string) => {
  switch (provider) {
    case 'stripe':
      return t('dashboard.orders.provider.stripe')
    case 'wechat':
      return t('dashboard.orders.provider.wechat')
    default:
      return provider
  }
}
</script>
