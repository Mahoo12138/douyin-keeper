<template>
  <form @submit="handleSubmit" class="flex items-center gap-2 flex-1">
    <!-- Search Field Selector -->
    <Select
      :model-value="searchField"
      @update:model-value="onFieldChange"
    >
      <SelectTrigger class="w-[120px]">
        <SelectValue :placeholder="t('admin.subscriptions.table.search.searchBy')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="userEmail">{{ t('admin.subscriptions.table.columns.user') }}</SelectItem>
        <SelectItem value="planId">{{ t('admin.subscriptions.table.columns.plan') }}</SelectItem>
        <SelectItem value="id">{{ t('admin.subscriptions.table.columns.id') }}</SelectItem>
        <SelectItem value="userId">User ID</SelectItem>
        <SelectItem value="stripeSubscriptionId">Stripe ID</SelectItem>
        <SelectItem value="creemSubscriptionId">Creem ID</SelectItem>
        <SelectItem value="dodoSubscriptionId">{{ t('admin.subscriptions.table.search.dodoSubscriptionId') }}</SelectItem>
      </SelectContent>
    </Select>

    <!-- Search Input -->
    <Input
      :placeholder="getSearchPlaceholder()"
      :model-value="searchValue"
      @update:model-value="setSearchValue"
      class="w-[250px]"
    />
    
    <!-- Search Button -->
    <Button type="submit" size="icon" class="shrink-0">
      <SearchIcon class="h-4 w-4" />
    </Button>

    <!-- Clear Button -->
    <Button type="button" variant="outline" size="icon" class="shrink-0" @click="handleClear">
      <X class="h-4 w-4" />
    </Button>

    <!-- Divider -->
    <div class="mx-2 h-4 w-[1px] bg-border" />

    <!-- Status Filter -->
    <Select
      :model-value="status"
      @update:model-value="onStatusChange"
    >
      <SelectTrigger class="w-[130px]">
        <SelectValue :placeholder="t('admin.subscriptions.table.search.filterByStatus')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ t('admin.subscriptions.table.search.allStatuses') }}</SelectItem>
        <SelectItem value="active">{{ t('admin.subscriptions.status.active') }}</SelectItem>
        <SelectItem value="trialing">{{ t('admin.subscriptions.status.trialing') }}</SelectItem>
        <SelectItem value="canceled">{{ t('admin.subscriptions.status.canceled') }}</SelectItem>
        <SelectItem value="expired">{{ t('admin.subscriptions.status.expired') }}</SelectItem>
        <SelectItem value="inactive">{{ t('admin.subscriptions.status.inactive') }}</SelectItem>
      </SelectContent>
    </Select>

    <!-- Provider Filter -->
    <Select
      :model-value="provider"
      @update:model-value="onProviderChange"
    >
      <SelectTrigger class="w-[130px]">
        <SelectValue :placeholder="t('admin.subscriptions.table.search.filterByProvider')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ t('admin.subscriptions.table.search.allProviders') }}</SelectItem>
        <SelectItem value="stripe">{{ t('admin.subscriptions.table.search.stripe') }}</SelectItem>
        <SelectItem value="creem">{{ t('admin.subscriptions.table.search.creem') }}</SelectItem>
        <SelectItem value="dodo">{{ t('admin.subscriptions.table.search.dodo') }}</SelectItem>
        <SelectItem value="wechat">{{ t('admin.subscriptions.table.search.wechat') }}</SelectItem>
      </SelectContent>
    </Select>
  </form>
</template>

<script setup lang="ts">
import { SearchIcon, X } from 'lucide-vue-next'

// Get composables
const { t } = useI18n()
const router = useRouter()
const route = useRoute()

// Search state
const searchValue = ref((route.query.searchValue as string) || '')
const searchField = ref((route.query.searchField as string) || 'userEmail')
const status = ref((route.query.status as string) || 'all')
const provider = ref((route.query.provider as string) || 'all')

// Helper function to get search placeholder
const getSearchPlaceholder = () => {
  const fieldMap: Record<string, string> = {
    id: t('admin.subscriptions.table.columns.id'),
    userId: 'User ID',
    planId: t('admin.subscriptions.table.columns.plan'),
    userEmail: 'Email',
    stripeSubscriptionId: 'Stripe ID',
    creemSubscriptionId: 'Creem ID',
    dodoSubscriptionId: t('admin.subscriptions.table.search.dodoSubscriptionId')
  }
  return t('admin.subscriptions.table.search.searchPlaceholder', { field: fieldMap[searchField.value] })
}

// Update search value
const setSearchValue = (value: string | number) => {
  searchValue.value = String(value)
}

// Handle field change
const onFieldChange = (field: any) => {
  if (field && typeof field === 'string') {
    searchField.value = field
    onSearch()
  }
}

// Handle status change
const onStatusChange = (newStatus: any) => {
  if (newStatus && typeof newStatus === 'string') {
    status.value = newStatus
    onSearch()
  }
}

// Handle provider change
const onProviderChange = (newProvider: any) => {
  if (newProvider && typeof newProvider === 'string') {
    provider.value = newProvider
    onSearch()
  }
}

// Execute search
const onSearch = () => {
  const query = { ...route.query }
  
  // Update search parameters
  if (searchValue.value.trim()) {
    query.searchValue = searchValue.value.trim()
    query.searchField = searchField.value
  } else {
    delete query.searchValue
    delete query.searchField
  }
  
  // Update filters
  if (status.value && status.value !== 'all') {
    query.status = status.value
  } else {
    delete query.status
  }
  
  if (provider.value && provider.value !== 'all') {
    query.provider = provider.value
  } else {
    delete query.provider
  }
  
  // Reset to first page when search changes
  query.page = '1'
  
  // Navigate with new query
  router.push({ query })
}

// Handle clear
const handleClear = () => {
  // Reset all search parameters to default
  searchValue.value = ''
  searchField.value = 'userEmail'
  status.value = 'all'
  provider.value = 'all'
  
  // Navigate to clean URL (only keep non-search parameters)
  const query: any = {}
  // Keep only non-search related query parameters if any
  // For now, we'll clear everything and go to page 1
  query.page = '1'
  
  router.push({ query })
}

// Handle form submit
const handleSubmit = (e: Event) => {
  e.preventDefault()
  onSearch()
}

// Watch for route changes to update local state
watch(() => route.query, (newQuery) => {
  searchValue.value = (newQuery.searchValue as string) || ''
  searchField.value = (newQuery.searchField as string) || 'userEmail'
  status.value = (newQuery.status as string) || 'all'
  provider.value = (newQuery.provider as string) || 'all'
}, { immediate: true })
</script> 