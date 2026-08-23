<template>
  <div class="flex flex-col gap-4 py-10 px-5">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ $t('admin.subscriptions.title') }}</h1>
        <p class="text-muted-foreground">{{ $t('admin.subscriptions.description') }}</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error" class="rounded-md bg-destructive/15 p-4">
      <div class="flex">
        <div class="ml-3">
          <h3 class="text-sm font-medium text-destructive">{{ $t('admin.subscriptions.fetchError') }}</h3>
          <div class="mt-2 text-sm text-destructive">
            <p>{{ error }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Initial Loading State (only on first load) -->
    <div v-else-if="pending && !subscriptionsData" class="flex items-center justify-center py-20">
      <Loader2 class="h-8 w-8 animate-spin text-primary" />
      <span class="ml-2 text-muted-foreground">{{ $t('common.loading') }}</span>
    </div>

    <!-- Data Table (stays mounted after first load) -->
    <div v-else class="flex flex-col gap-4">
      <SubscriptionsDataTable 
        :data="(subscriptionsData?.subscriptions || []) as any[]" 
        :pagination="pagination || undefined"
        @refresh-data="refresh"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

// Define page metadata
definePageMeta({
  layout: 'admin'
})

// Get composables
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// Parse query parameters - matching orders API pattern
const page = computed(() => parseInt(String(route.query.page || '1')) || 1)
const limit = 10

// Build query object for API call
const queryParams = computed(() => {
  const params: any = {
    page: page.value,
    limit,
  }
  
  // Add search parameters if present
  if (route.query.searchValue) {
    params.searchValue = String(route.query.searchValue)
  }
  if (route.query.searchField) {
    params.searchField = String(route.query.searchField)
  }
  if (route.query.status && route.query.status !== 'all') {
    params.status = String(route.query.status)
  }
  if (route.query.provider && route.query.provider !== 'all') {
    params.provider = String(route.query.provider)
  }
  if (route.query.sortBy) {
    params.sortBy = String(route.query.sortBy)
  }
  if (route.query.sortDirection) {
    params.sortDirection = String(route.query.sortDirection)
  }
  
  return params
})

// Fetch subscriptions data
const { data: subscriptionsData, pending, error, refresh } = await useFetch('/api/admin/subscriptions', {
  query: queryParams,
  server: false
})

// Computed properties
const subscriptions = computed(() => subscriptionsData.value?.subscriptions || [])
const total = computed(() => subscriptionsData.value?.total || 0)
const totalPages = computed(() => subscriptionsData.value?.totalPages || 0)

// Compute pagination object - matching orders pattern
const pagination = computed(() => {
  if (!subscriptionsData.value) return undefined
  
  return {
    currentPage: page.value,
    totalPages: subscriptionsData.value.totalPages || 1,
    pageSize: limit,
    total: subscriptionsData.value.total || 0
  }
})

// Watch for query changes and refresh data
watch(() => route.query, () => {
  refresh()
}, { deep: true })

// SEO and meta
useHead({
  title: computed(() => t('admin.subscriptions.title')),
  meta: [
    {
      name: 'description',
      content: computed(() => t('admin.subscriptions.description'))
    }
  ]
})
</script> 