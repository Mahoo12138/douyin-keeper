<template>
  <form @submit="handleSubmit" class="flex items-center gap-2 flex-1">
    <!-- Search Field Selector -->
    <Select
      :model-value="searchField"
      @update:model-value="onFieldChange"
    >
      <SelectTrigger class="w-[120px]">
        <SelectValue :placeholder="t('admin.credits.table.search.searchBy')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="userEmail">{{ t('admin.credits.table.columns.user') }}</SelectItem>
        <SelectItem value="userName">Name</SelectItem>
        <SelectItem value="id">{{ t('admin.credits.table.columns.id') }}</SelectItem>
        <SelectItem value="userId">User ID</SelectItem>
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

    <!-- Type Filter -->
    <Select
      :model-value="type"
      @update:model-value="onTypeChange"
    >
      <SelectTrigger class="w-[130px]">
        <SelectValue :placeholder="t('admin.credits.table.search.filterByType')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ t('admin.credits.table.search.allTypes') }}</SelectItem>
        <SelectItem value="purchase">{{ t('admin.credits.table.search.purchase') }}</SelectItem>
        <SelectItem value="consumption">{{ t('admin.credits.table.search.consumption') }}</SelectItem>
        <SelectItem value="refund">{{ t('admin.credits.table.search.refund') }}</SelectItem>
        <SelectItem value="bonus">{{ t('admin.credits.table.search.bonus') }}</SelectItem>
        <SelectItem value="adjustment">{{ t('admin.credits.table.search.adjustment') }}</SelectItem>
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
const type = ref((route.query.type as string) || 'all')

// Helper function to get search placeholder
const getSearchPlaceholder = () => {
  const fieldMap: Record<string, string> = {
    id: t('admin.credits.table.columns.id'),
    userId: 'User ID',
    userEmail: 'Email',
    userName: 'Name'
  }
  return t('admin.credits.table.search.searchPlaceholder', { field: fieldMap[searchField.value] })
}

// Update search value
const setSearchValue = (value: string | number) => {
  searchValue.value = String(value)
}

// Handle field change
const onFieldChange = (field: any) => {
  if (field && typeof field === 'string') {
    searchField.value = field
    searchValue.value = '' // Clear search value when changing field
  }
}

// Handle type change
const onTypeChange = (newType: any) => {
  if (newType && typeof newType === 'string') {
    type.value = newType
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
  if (type.value && type.value !== 'all') {
    query.type = type.value
  } else {
    delete query.type
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
  type.value = 'all'
  onSearch()
}

// Watch for route changes to update local state
watch(() => route.query, (newQuery) => {
  searchValue.value = (newQuery.searchValue as string) || ''
  searchField.value = (newQuery.searchField as string) || 'userEmail'
  type.value = (newQuery.type as string) || 'all'
}, { immediate: true })
</script>

