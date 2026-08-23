<template>
  <div class="container mx-auto py-10 px-5">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-2xl font-bold">{{ $t('admin.users.title') }}</h1>
        <p class="text-muted-foreground">{{ $t('admin.users.subtitle') }}</p>
      </div>
      
      <NuxtLink to="/admin/users/new">
        <Button>
          <UserPlus class="mr-2 h-4 w-4" />
          {{ $t('admin.users.actions.addUser') }}
        </Button>
      </NuxtLink>
    </div>
    
    <div class="flex flex-col gap-4">
      <!-- Error State -->
      <div v-if="error" class="rounded-md bg-destructive/15 p-4">
        <div class="flex">
          <div class="ml-3">
            <h3 class="text-sm font-medium text-destructive">{{ $t('admin.users.messages.fetchError') }}</h3>
            <div class="mt-2 text-sm text-destructive">
              <p>{{ error }}</p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Initial Loading State (only on first load) -->
      <div v-else-if="pending && !data" class="flex items-center justify-center py-20">
        <Loader2 class="h-8 w-8 animate-spin text-primary" />
        <span class="ml-2 text-muted-foreground">{{ $t('common.loading') }}</span>
      </div>
      
      <!-- Data Table (stays mounted after first load) -->
      <div v-else>
        <UsersDataTable 
          :data="data?.users || []"
          :pagination="{
            currentPage: page,
            totalPages: data?.totalPages || 1,
            pageSize: limit,
            total: data?.total || 0
          }"
          @refresh-data="refresh"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { UserPlus, Loader2 } from 'lucide-vue-next'
//import UsersDataTable from '../../../components/admin/users/UsersDataTable.vue'

// Define page metadata
definePageMeta({
  layout: 'admin'
  // No middleware needed - auth.global.ts handles admin routes automatically
})

// Get route and composables
const route = useRoute()
const router = useRouter()

// Extract query parameters
const page = computed(() => parseInt(String(route.query.page || '1')) || 1)
const limit = 10

// Build query parameters for API call
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
  if (route.query.role && route.query.role !== 'all') {
    params.role = String(route.query.role)
  }
  if (route.query.banned && route.query.banned !== 'all') {
    params.banned = String(route.query.banned)
  }
  if (route.query.sortBy) {
    params.sortBy = String(route.query.sortBy)
  }
  if (route.query.sortDirection) {
    params.sortDirection = String(route.query.sortDirection)
  }
  
  return params
})

// Fetch users data
const { data, pending, error, refresh } = await useFetch('/api/admin/users', {
  query: queryParams,
  server: false  // Only fetch on client-side
})

// Watch for query changes and refresh data
watch(() => route.query, () => {
  refresh()
}, { deep: true })

// Helper functions - removed as they're now handled by DataTable components

// Set page title
const { t } = useI18n()
useHead({
  title: computed(() => t('admin.users.title'))
})
</script> 