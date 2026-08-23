<template>
  <div>
    <!-- SEO Head -->
    <Head>
      <title>{{ $t('premiumFeatures.metadata.title') }}</title>
      <meta name="description" :content="$t('premiumFeatures.metadata.description')" />
      <meta name="keywords" :content="$t('premiumFeatures.metadata.keywords')" />
    </Head>

    <div class="container py-10 mx-auto">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center py-20">
        <Loader2 class="h-8 w-8 animate-spin text-primary" />
        <span class="ml-2 text-muted-foreground">{{ $t('premiumFeatures.loading') }}</span>
      </div>

      <!-- Content -->
      <div v-else>
        <!-- Header -->
        <div class="flex flex-col items-start gap-4 md:flex-row md:justify-between md:gap-8">
          <div class="flex-1 space-y-4">
            <div class="inline-flex items-center gap-2">
              <h1 class="text-3xl font-bold tracking-tight">{{ $t('premiumFeatures.title') }}</h1>
              <Badge v-if="userData?.isLifetime" variant="outline" class="bg-chart-5-bg-15 text-chart-5 border-chart-5/20 hover:bg-chart-5-bg-15">
                {{ $t('premiumFeatures.badges.lifetime') }}
              </Badge>
            </div>
            <p class="text-muted-foreground">
              {{ $t('premiumFeatures.description') }}
            </p>
            
            <!-- Template Demo Notice -->
            <div class="rounded-lg border border-primary/20 bg-primary/5 p-4 mt-4">
              <div class="flex items-start gap-3">
                <div class="rounded-full bg-primary/10 p-2 mt-0.5">
                  <Info class="h-4 w-4 text-primary" />
                </div>
                <div class="flex-1 space-y-1">
                  <p class="text-sm font-medium text-foreground">
                    {{ $t('premiumFeatures.demoNotice.title') }}
                  </p>
                  <p class="text-sm text-muted-foreground">
                    {{ $t('premiumFeatures.demoNotice.description') }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Subscription Info -->
        <Card v-if="userData" class="mt-6 mb-8">
          <CardHeader>
            <CardTitle>{{ $t('premiumFeatures.subscription.title') }}</CardTitle>
            <CardDescription>{{ $t('premiumFeatures.subscription.description') }}</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <p class="text-sm font-medium">{{ $t('premiumFeatures.subscription.status') }}</p>
                <div class="flex items-center space-x-2">
                  <div v-if="userData.subscriptionActive" class="w-2 h-2 bg-primary rounded-full"></div>
                  <div v-else class="w-2 h-2 bg-destructive rounded-full"></div>
                  <span :class="userData.subscriptionActive ? 'text-primary' : 'text-destructive'">
                    {{ userData.subscriptionActive ? $t('premiumFeatures.subscription.active') : $t('premiumFeatures.subscription.inactive') }}
                  </span>
                </div>
              </div>
              
              <div class="space-y-2">
                <p class="text-sm font-medium">{{ $t('premiumFeatures.subscription.type') }}</p>
                <p class="text-sm text-muted-foreground">
                  {{ userData.isLifetime ? $t('premiumFeatures.subscription.lifetime') : $t('premiumFeatures.subscription.recurring') }}
                </p>
              </div>
              
              <div v-if="!userData.isLifetime && userData.expiresAt" class="space-y-2">
                <p class="text-sm font-medium">{{ $t('premiumFeatures.subscription.expiresAt') }}</p>
                <p class="text-sm text-muted-foreground">
                  {{ formatDate(userData.expiresAt) }}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Premium Features Grid -->
        <div class="grid gap-6 pt-4 md:grid-cols-2 lg:grid-cols-4">
          <Card v-for="(feature, index) in premiumFeatures" :key="index" class="flex flex-col justify-between">
            <CardHeader>
              <div class="rounded-full w-12 h-12 flex items-center justify-center bg-primary/10 text-primary mb-4">
                <component :is="feature.icon" />
              </div>
              <CardTitle>{{ feature.title }}</CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-muted-foreground">{{ feature.description }}</p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" class="w-full">{{ $t('premiumFeatures.actions.accessFeature') }}</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Loader2, User, Sparkles, FileText, BarChart, Info } from 'lucide-vue-next'

// Router and i18n
const { t, locale } = useI18n()

// Reactive state
const isLoading = ref(true)
const userData = ref<{
  subscriptionActive: boolean
  subscriptionType: string
  isLifetime: boolean
  expiresAt?: string
} | null>(null)

// Premium features data
const premiumFeatures = [
  {
    icon: User,
    title: t('premiumFeatures.features.userManagement.title'),
    description: t('premiumFeatures.features.userManagement.description')
  },
  {
    icon: Sparkles,
    title: t('premiumFeatures.features.aiAssistant.title'),
    description: t('premiumFeatures.features.aiAssistant.description')
  },
  {
    icon: FileText,
    title: t('premiumFeatures.features.documentProcessing.title'),
    description: t('premiumFeatures.features.documentProcessing.description')
  },
  {
    icon: BarChart,
    title: t('premiumFeatures.features.dataAnalytics.title'),
    description: t('premiumFeatures.features.dataAnalytics.description')
  }
]

// Utility functions
const formatDate = (dateString: string) => {
  const localeCode = locale.value === 'zh-CN' ? 'zh-CN' : 'en-US'
  return new Date(dateString).toLocaleDateString(localeCode)
}

// Fetch subscription details
const fetchSubscriptionDetails = async () => {
  try {
    const response = await $fetch('/api/subscription/status')
    
    if (response) {
      userData.value = {
        subscriptionActive: response.hasSubscription,
        subscriptionType: response.isLifetime ? 'lifetime' : 'recurring',
        isLifetime: response.isLifetime,
        expiresAt: response.subscription?.periodEnd
      }
    }
  } catch (error) {
    console.error('Failed to fetch subscription details', error)
  } finally {
    isLoading.value = false
  }
}

// Fetch data on mount
onMounted(() => {
  fetchSubscriptionDetails()
})
</script> 