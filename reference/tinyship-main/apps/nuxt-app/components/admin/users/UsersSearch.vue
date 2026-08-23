<template>
  <form @submit="handleSubmit" class="flex items-center gap-2 flex-1">
    <!-- Search Field Selector -->
    <Select :model-value="searchField" @update:model-value="(value: any) => onFieldChange(value as SearchField)">
      <SelectTrigger class="w-[120px]">
        <SelectValue :placeholder="$t('admin.users.table.search.searchBy')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="email">{{ $t('admin.users.table.columns.email') }}</SelectItem>
        <SelectItem value="name">{{ $t('admin.users.table.columns.name') }}</SelectItem>
        <SelectItem value="id">{{ $t('admin.users.table.columns.id') }}</SelectItem>
      </SelectContent>
    </Select>

    <!-- Search Input -->
    <Input
      :placeholder="$t('admin.users.table.search.searchPlaceholder').replace('{field}', searchField)"
      :model-value="searchValue"
      @update:model-value="setSearchValue"
      class="w-[250px]"
    />
    
    <!-- Search Button -->
    <Button type="submit" size="icon" class="shrink-0">
      <Search class="h-4 w-4" />
    </Button>

    <!-- Clear Button -->
    <Button type="button" variant="outline" size="icon" class="shrink-0" @click="handleClear">
      <X class="h-4 w-4" />
    </Button>

    <!-- Separator -->
    <div class="mx-2 h-4 w-[1px] bg-border" />

    <!-- Role Filter -->
    <Select :model-value="role" @update:model-value="(value: any) => onRoleChange(value as Role)">
      <SelectTrigger class="w-[130px]">
        <SelectValue :placeholder="$t('admin.users.table.search.filterByRole')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ $t('admin.users.table.search.allRoles') }}</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
        <SelectItem value="user">User</SelectItem>
      </SelectContent>
    </Select>

    <!-- Ban Status Filter -->
    <Select :model-value="banned" @update:model-value="(value: any) => onBannedChange(value as BannedStatus)">
      <SelectTrigger class="w-[130px]">
        <SelectValue :placeholder="$t('admin.users.table.search.banStatus')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ $t('admin.users.table.search.allUsers') }}</SelectItem>
        <SelectItem value="true">{{ $t('admin.users.table.search.bannedUsers') }}</SelectItem>
        <SelectItem value="false">{{ $t('admin.users.table.search.notBannedUsers') }}</SelectItem>
      </SelectContent>
    </Select>
  </form>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Search, X } from 'lucide-vue-next'

type SearchField = "email" | "name" | "id"
type Role = "admin" | "user" | "all"
type BannedStatus = "true" | "false" | "all"

const router = useRouter()
const route = useRoute()

// Reactive state based on URL parameters
const searchValue = ref(String(route.query.searchValue || ''))
const searchField = ref<SearchField>((route.query.searchField as SearchField) || 'email')
const role = ref<Role>((route.query.role as Role) || 'all')
const banned = ref<BannedStatus>((route.query.banned as BannedStatus) || 'all')

// Helper function to create query string
const createQueryString = (params: Record<string, string | null>) => {
  const query = { ...route.query }
  
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === 'all') {
      delete query[key]
    } else {
      query[key] = value
    }
  })
  
  return query
}

// Handle search submission
const onSearch = () => {
  const query = createQueryString({
    searchValue: searchValue.value || null,
    searchField: searchField.value,
    role: role.value === "all" ? null : role.value,
    banned: banned.value === "all" ? null : banned.value,
    page: "1", // Reset to first page on search
  })
  
  router.push({ query })
}

// Handle field change
const onFieldChange = (value: SearchField) => {
  searchField.value = value
  searchValue.value = '' // Clear search value when changing field
}

// Handle role change
const onRoleChange = (value: Role) => {
  role.value = value
  const query = createQueryString({
    role: value === "all" ? null : value,
    page: "1",
  })
  router.push({ query })
}

// Handle banned status change
const onBannedChange = (value: BannedStatus) => {
  banned.value = value
  const query = createQueryString({
    banned: value === "all" ? null : value,
    page: "1",
  })
  router.push({ query })
}

// Handle form submission
const handleSubmit = (e: Event) => {
  e.preventDefault()
  onSearch()
}

// Helper to set search value
const setSearchValue = (value: string | number) => {
  searchValue.value = String(value)
}

// Watch for route changes to update local state
watch(() => route.query, (newQuery) => {
  searchValue.value = String(newQuery.searchValue || '')
  searchField.value = (newQuery.searchField as SearchField) || 'email'
  role.value = (newQuery.role as Role) || 'all'
  banned.value = (newQuery.banned as BannedStatus) || 'all'
}, { immediate: true })

// Handle clear button
const handleClear = () => {
  searchValue.value = ''
  searchField.value = 'email'
  role.value = 'all'
  banned.value = 'all'
  onSearch()
}
</script> 