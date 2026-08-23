<script setup lang="ts">
import { 
  CreditCard, 
  CalendarIcon,
  ExternalLink,
  Package,
  Loader2
} from 'lucide-vue-next'
import  { config } from '@config'
const { t, locale } = useI18n()
const localePath = useLocalePath()

// Subscription data state
const subscriptionData = ref<any>(null)
const loading = ref(true)
const redirecting = ref(false)

/**
 * Fetch subscription data from API
 */
const fetchSubscriptionData = async () => {
  try {
    const data = await $fetch('/api/subscription/status')
    subscriptionData.value = data
  } catch (error) {
    console.error('Failed to fetch subscription data', error)
  } finally {
    loading.value = false
  }
}

/**
 * Open customer portal (auto-detects provider)
 */
const openCustomerPortal = async (provider?: string) => {
  try {
    redirecting.value = true
    const returnUrl = `${window.location.origin}/dashboard`
    
    const { url } = await $fetch('/api/subscription/portal', {
      method: 'POST',
      body: { 
        returnUrl,
        provider // 可选：指定支付提供商，如果不指定则自动检测
      }
    })
    
    // 重定向到客户门户
    window.location.href = url
  } catch (error) {
    console.error('打开客户门户失败:', error)
    // 显示错误提示
    redirecting.value = false
  }
}

/**
 * Get plan name from config
 */
const getPlanName = (planId: string) => {
  const plan = config.payment.plans[planId as keyof typeof config.payment.plans];
  if (!plan) return planId; // 如果找不到计划，则返回 planId
  
  // 使用当前语言的翻译
  if (plan.i18n && plan.i18n[locale.value]) {
    return plan.i18n[locale.value].name;
  } else {
    return plan.id
  }
};

/**
 * Format date according to user locale
 */
const formatDate = (dateString: string | Date) => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  const currentLocale = locale.value
  return date.toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Calculate subscription progress percentage
 */
const calculateProgress = () => {
  if (!subscriptionData.value?.subscription) return 0
  
  const start = new Date(subscriptionData.value.subscription.periodStart).getTime()
  const end = new Date(subscriptionData.value.subscription.periodEnd).getTime()
  const now = Date.now()
  
  if (now >= end) return 100
  if (now <= start) return 0
  
  return Math.floor(((now - start) / (end - start)) * 100)
}

// Computed properties
const isLifetime = computed(() => subscriptionData.value?.isLifetime)
const sub = computed(() => subscriptionData.value?.subscription)
const planId = computed(() => sub.value?.planId || '')

// Fetch data when component mounts
onMounted(() => {
  fetchSubscriptionData()
})
</script>

<template>
  <!-- Loading state -->
  <div v-if="loading" class="space-y-4">
    <div class="flex items-center justify-center h-40">
      <Loader2 class="h-10 w-10 animate-spin text-primary" />
    </div>
  </div>

  <!-- No subscription state -->
  <div v-else-if="!subscriptionData?.hasSubscription && !subscriptionData?.isLifetime" class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>{{ t('subscription.noSubscription.title') }}</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="mb-4">{{ t('subscription.noSubscription.description') }}</p>
        <Button :as-child="true">
          <NuxtLink :to="localePath('/pricing')">{{ t('subscription.noSubscription.viewPlans') }}</NuxtLink>
        </Button>
      </CardContent>
    </Card>
  </div>

  <!-- Subscription details -->
  <Card v-else>
    <CardHeader>
      <CardTitle>{{ t('subscription.title') }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-6">
      <!-- 订阅概览部分 -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <Package class="h-5 w-5 mr-2 text-primary" />
            <span class="font-medium">{{ t('subscription.overview.planType') }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-medium text-primary">
              {{ isLifetime ? t('dashboard.subscription.status.lifetime') : getPlanName(planId) }}
            </span>
            <span 
              v-if="!isLifetime && sub" 
              class="px-2 py-1 rounded-full border text-xs"
            >
              {{ sub.paymentType === 'recurring' 
                ? t('dashboard.subscription.paymentType.recurring') 
                : t('dashboard.subscription.paymentType.oneTime') }}
            </span>
          </div>
        </div>
        
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <CreditCard class="h-5 w-5 mr-2 text-primary" />
            <span class="font-medium">{{ t('subscription.overview.status') }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
              {{ t('subscription.overview.active') }}
            </span>
            <span v-if="sub?.cancelAtPeriodEnd" class="px-2 py-1 rounded-full bg-accent text-xs">
              {{ t('dashboard.subscription.status.cancelAtPeriodEnd') }}
            </span>
          </div>
        </div>
        
        <template v-if="!isLifetime && sub">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <CalendarIcon class="h-5 w-5 mr-2 text-primary" />
              <span class="font-medium">{{ t('subscription.overview.startDate') }}</span>
            </div>
            <span>{{ formatDate(sub.periodStart) }}</span>
          </div>
          
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <CalendarIcon class="h-5 w-5 mr-2 text-primary" />
              <span class="font-medium">{{ t('subscription.overview.endDate') }}</span>
            </div>
            <span>{{ formatDate(sub.periodEnd) }}</span>
          </div>
          
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-medium">{{ t('subscription.overview.progress') }}</span>
              <span>{{ calculateProgress() }}%</span>
            </div>
            <Progress :model-value="calculateProgress()" class="h-2" />
          </div>
        </template>
      </div>

      <!-- 分割线 -->
      <div class="border-t pt-6" v-if="sub?.stripeCustomerId || sub?.creemCustomerId || sub?.dodoCustomerId">
        <h3 class="text-lg font-medium mb-4">{{ t('subscription.management.title') }}</h3>
        <div class="rounded-lg border p-4">
          <p class="text-sm text-muted-foreground mb-4">
            {{ t('subscription.management.description') }}
          </p>
          <div class="flex gap-3">
            <Button 
              variant="default" 
              class="flex items-center gap-1"
              @click="openCustomerPortal()"
              :disabled="redirecting"
            >
              <ExternalLink class="h-4 w-4" />
              {{ redirecting ? t('subscription.management.redirecting') : t('subscription.management.manageSubscription') }}
            </Button>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template> 