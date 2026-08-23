<template>
  <form @submit="handleSubmit" class="flex items-center gap-2 flex-1">
    <!-- Search Field Selector -->
    <Select
      :model-value="searchField"
      @update:model-value="onFieldChange"
    >
      <SelectTrigger class="w-[120px]">
        <SelectValue :placeholder="t('admin.orders.table.search.searchBy')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="userEmail">{{ t('admin.orders.table.columns.user') }}</SelectItem>
        <SelectItem value="planId">{{ t('admin.orders.table.columns.plan') }}</SelectItem>
        <SelectItem value="id">{{ t('admin.orders.table.columns.id') }}</SelectItem>
        <SelectItem value="userId">User ID</SelectItem>
        <SelectItem value="providerOrderId">{{ t('admin.orders.table.columns.providerOrderId') }}</SelectItem>
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
        <SelectValue :placeholder="t('admin.orders.table.search.filterByStatus')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ t('admin.orders.table.search.allStatus') }}</SelectItem>
        <SelectItem value="pending">{{ t('admin.orders.status.pending') }}</SelectItem>
        <SelectItem value="paid">{{ t('admin.orders.status.paid') }}</SelectItem>
        <SelectItem value="failed">{{ t('admin.orders.status.failed') }}</SelectItem>
        <SelectItem value="refunded">{{ t('admin.orders.status.refunded') }}</SelectItem>
        <SelectItem value="canceled">{{ t('admin.orders.status.canceled') }}</SelectItem>
      </SelectContent>
    </Select>

    <!-- Provider Filter -->
    <Select
      :model-value="provider"
      @update:model-value="onProviderChange"
    >
      <SelectTrigger class="w-[130px]">
        <SelectValue :placeholder="t('admin.orders.table.search.filterByProvider')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ t('admin.orders.table.search.allProviders') }}</SelectItem>
        <SelectItem value="stripe">{{ t('admin.orders.table.search.stripe') }}</SelectItem>
        <SelectItem value="wechat">{{ t('admin.orders.table.search.wechat') }}</SelectItem>
        <SelectItem value="creem">{{ t('admin.orders.table.search.creem') }}</SelectItem>
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
    id: t('admin.orders.table.columns.id'),
    userId: 'User ID',
    planId: t('admin.orders.table.columns.plan'),
    userEmail: 'Email',
    providerOrderId: t('admin.orders.table.columns.providerOrderId')
  }
  return t('admin.orders.table.search.searchPlaceholder', { field: fieldMap[searchField.value] })
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

// Handle form submit
const handleSubmit = (e: Event) => {
  e.preventDefault()
  onSearch()
}

// Handle clear
const handleClear = () => {
  searchValue.value = ''
  searchField.value = 'userEmail'
  status.value = 'all'
  provider.value = 'all'
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