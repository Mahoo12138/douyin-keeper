<template>
  <div class="container mx-auto py-10 px-5">
    <!-- Page Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ t('admin.credits.title') }}</h1>
        <p class="text-muted-foreground">{{ t('admin.credits.subtitle') }}</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error" class="rounded-md bg-destructive/15 p-4">
      <div class="flex">
        <div class="ml-3">
          <h3 class="text-sm font-medium text-destructive">{{ t('admin.credits.messages.fetchError') }}</h3>
          <div class="mt-2 text-sm text-destructive">
            <p>{{ error }}</p>
          </div>
          <div class="mt-4">
            <Button @click="refresh" variant="outline" size="sm">
              {{ t('actions.tryAgain') }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Initial Loading State (only on first load) -->
    <div v-else-if="pending && !data" class="flex items-center justify-center py-20">
      <Loader2 class="h-8 w-8 animate-spin text-primary" />
      <span class="ml-2 text-muted-foreground">{{ t('common.loading') }}</span>
    </div>

    <!-- Data Table (stays mounted after first load) -->
    <div v-else class="flex flex-col gap-4">
      <CreditsDataTable 
        :data="(data?.transactions || []) as any[]" 
        :pagination="pagination || undefined"
        @refresh-data="refresh"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

// Define page metadata
definePageMeta({
  layout: 'admin'
})

// Get composables
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// Parse query parameters - matching users API pattern
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
  if (route.query.type && route.query.type !== 'all') {
    params.type = String(route.query.type)
  }
  if (route.query.sortBy) {
    params.sortBy = String(route.query.sortBy)
  }
  if (route.query.sortDirection) {
    params.sortDirection = String(route.query.sortDirection)
  }
  
  return params
})

// Fetch credit transactions data
const { data, error, pending, refresh } = await useFetch('/api/admin/credits/transactions', {
  query: queryParams,
  server: false,

  onResponseError({ response }) {
    console.error('Failed to fetch credit transactions:', response._data)
    toast.error(t('admin.credits.messages.fetchError'))
  }
})

// Compute pagination object - matching users pattern
const pagination = computed(() => {
  if (!data.value) return undefined
  
  return {
    currentPage: page.value,
    totalPages: data.value.totalPages || 1,
    pageSize: limit,
    total: data.value.total || 0
  }
})

// Watch for query changes and refresh data
watch(() => route.query, () => {
  refresh()
}, { deep: true })

// Set page title
useHead({
  title: computed(() => t('admin.credits.title'))
})
</script>

