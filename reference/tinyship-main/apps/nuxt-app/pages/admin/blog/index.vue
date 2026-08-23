<template>
  <div class="container mx-auto py-10 px-5">
    <!-- Page Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ t('admin.blog.title') }}</h1>
        <p class="text-muted-foreground">{{ t('admin.blog.subtitle') }}</p>
      </div>
      <NuxtLink to="/admin/blog/new">
        <Button>
          <Plus class="mr-2 h-4 w-4" />
          {{ t('actions.createPost') }}
        </Button>
      </NuxtLink>
    </div>

    <!-- Error State -->
    <div v-if="error" class="rounded-md bg-destructive/15 p-4">
      <div class="flex">
        <div class="ml-3">
          <h3 class="text-sm font-medium text-destructive">{{ t('admin.blog.messages.fetchError') }}</h3>
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

    <!-- Initial Loading State -->
    <div v-else-if="pending && !data" class="flex items-center justify-center py-20">
      <Loader2 class="h-8 w-8 animate-spin text-primary" />
      <span class="ml-2 text-muted-foreground">{{ t('common.loading') }}</span>
    </div>

    <!-- Data Table -->
    <div v-else class="flex flex-col gap-4">
      <BlogDataTable
        :data="(data?.posts || []) as any[]"
        :pagination="pagination || undefined"
        @refresh-data="refresh"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

definePageMeta({
  layout: 'admin',
})

const { t } = useI18n()
const route = useRoute()

const page = computed(() => parseInt(String(route.query.page || '1')) || 1)
const limit = 10

const queryParams = computed(() => {
  const params: Record<string, string | number> = {
    page: page.value,
    limit,
  }

  if (route.query.search) {
    params.search = String(route.query.search)
  }
  if (route.query.status && route.query.status !== 'all') {
    params.status = String(route.query.status)
  }
  if (route.query.sortBy) {
    params.sortBy = String(route.query.sortBy)
  }
  if (route.query.sortDirection) {
    params.sortDirection = String(route.query.sortDirection)
  }

  return params
})

const { data, error, pending, refresh } = await useFetch('/api/admin/blog', {
  query: queryParams,
  server: false,

  onResponseError({ response }) {
    console.error('Failed to fetch blog posts:', response._data)
    toast.error(t('admin.blog.messages.fetchError'))
  },
})

const pagination = computed(() => {
  if (!data.value) return undefined

  return {
    currentPage: page.value,
    totalPages: data.value.totalPages || 1,
    pageSize: limit,
    total: data.value.total || 0,
  }
})

watch(
  () => route.query,
  () => {
    refresh()
  },
  { deep: true },
)

useHead({
  title: computed(() => t('admin.blog.title')),
})
</script>
