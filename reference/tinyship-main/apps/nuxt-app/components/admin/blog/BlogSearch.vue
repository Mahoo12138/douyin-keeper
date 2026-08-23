<template>
  <form @submit="handleSubmit" class="flex items-center gap-2 flex-1">
    <!-- Search Input -->
    <Input
      :placeholder="t('admin.blog.table.search.searchPlaceholder')"
      :model-value="search"
      @update:model-value="setSearch"
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
    <Select :model-value="status" @update:model-value="onStatusChange">
      <SelectTrigger class="w-[130px]">
        <SelectValue :placeholder="t('admin.blog.table.search.filterByStatus')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ t('admin.blog.table.search.allStatus') }}</SelectItem>
        <SelectItem value="draft">{{ t('admin.blog.table.search.draft') }}</SelectItem>
        <SelectItem value="published">{{ t('admin.blog.table.search.published') }}</SelectItem>
      </SelectContent>
    </Select>
  </form>
</template>

<script setup lang="ts">
import { SearchIcon, X } from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const search = ref((route.query.search as string) || '')
const status = ref((route.query.status as string) || 'all')

const setSearch = (value: string | number) => {
  search.value = String(value)
}

const onStatusChange = (newStatus: unknown) => {
  if (newStatus != null && typeof newStatus === 'string') {
    status.value = newStatus
    onSearch()
  }
}

const onSearch = () => {
  const query = { ...route.query }

  if (search.value.trim()) {
    query.search = search.value.trim()
  } else {
    delete query.search
  }

  if (status.value && status.value !== 'all') {
    query.status = status.value
  } else {
    delete query.status
  }

  query.page = '1'
  router.push({ query })
}

const handleSubmit = (e: Event) => {
  e.preventDefault()
  onSearch()
}

const handleClear = () => {
  search.value = ''
  status.value = 'all'
  onSearch()
}

watch(
  () => route.query,
  (newQuery) => {
    search.value = (newQuery.search as string) || ''
    status.value = (newQuery.status as string) || 'all'
  },
  { immediate: true },
)
</script>
