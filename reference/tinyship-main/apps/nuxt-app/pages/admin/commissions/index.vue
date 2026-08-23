<script setup lang="ts">
import { Search, X, Loader2 } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const commissions = ref<any[]>([])
const loading = ref(true)
const page = ref(1)
const total = ref(0)
const searchValue = ref('')
const searchField = ref<'referrerEmail' | 'referrerName' | 'orderId'>('referrerEmail')
const status = ref('all')
const pageSize = 10

async function fetchData() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page.value - 1) * pageSize),
    })
    if (searchValue.value) {
      params.set('searchField', searchField.value)
      params.set('searchValue', searchValue.value)
    }
    if (status.value && status.value !== 'all') params.set('status', status.value)
    const data = await $fetch<any>(`/api/admin/commissions?${params}`)
    commissions.value = data?.commissions || []
    total.value = data?.total || 0
  } catch (err) {
    console.error('Failed to fetch commissions:', err)
  } finally {
    loading.value = false
  }
}

const totalPages = computed(() => Math.ceil(total.value / pageSize))

const statusVariantMap: Record<string, string> = {
  credited: 'default',
  pending: 'secondary',
  withdrawn: 'outline',
  cancelled: 'destructive',
}

const searchFieldLabels = computed(() => ({
  referrerEmail: t('admin.commissions.table.columns.referrerEmail'),
  referrerName: t('admin.commissions.table.columns.referrerName'),
  orderId: t('admin.commissions.table.columns.orderId'),
}))

function handleSearch() {
  page.value = 1
  fetchData()
}

function handleClear() {
  searchValue.value = ''
  searchField.value = 'referrerEmail'
  status.value = 'all'
  page.value = 1
  fetchData()
}

function handleFieldChange(value: any) {
  searchField.value = String(value) as typeof searchField.value
  searchValue.value = ''
}

function handleStatusChange(value: any) {
  status.value = String(value)
  page.value = 1
  fetchData()
}

function handlePageChange(newPage: number) {
  if (newPage >= 1 && newPage <= totalPages.value) {
    page.value = newPage
    fetchData()
  }
}

onMounted(() => fetchData())
</script>

<template>
  <div class="container mx-auto py-10 px-5">
    <h1 class="text-2xl font-bold mb-6">{{ t('admin.commissions.title') }}</h1>

    <div class="space-y-4">
      <form class="flex items-center gap-2 flex-wrap" @submit.prevent="handleSearch">
        <Select :model-value="searchField" @update:model-value="handleFieldChange">
          <SelectTrigger class="w-[140px]">
            <SelectValue :placeholder="t('admin.commissions.table.search.searchBy')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="referrerEmail">{{ searchFieldLabels.referrerEmail }}</SelectItem>
            <SelectItem value="referrerName">{{ searchFieldLabels.referrerName }}</SelectItem>
            <SelectItem value="orderId">{{ searchFieldLabels.orderId }}</SelectItem>
          </SelectContent>
        </Select>

        <Input
          v-model="searchValue"
          :placeholder="t('admin.commissions.table.search.searchPlaceholder', { field: searchFieldLabels[searchField] })"
          class="w-[250px]"
        />
        <Button type="submit" size="icon" class="shrink-0">
          <Search class="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" class="shrink-0" @click="handleClear">
          <X class="h-4 w-4" />
        </Button>

        <div class="mx-2 h-4 w-px bg-border hidden sm:block" />

        <Select :model-value="status" @update:model-value="handleStatusChange">
          <SelectTrigger class="w-[150px]">
            <SelectValue :placeholder="t('admin.commissions.filter.filterByStatus')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{{ t('admin.commissions.filter.allStatus') }}</SelectItem>
            <SelectItem value="credited">{{ t('admin.commissions.filter.credited') }}</SelectItem>
            <SelectItem value="pending">{{ t('admin.commissions.filter.pending') }}</SelectItem>
            <SelectItem value="withdrawn">{{ t('admin.commissions.filter.withdrawn') }}</SelectItem>
            <SelectItem value="cancelled">{{ t('admin.commissions.filter.cancelled') }}</SelectItem>
          </SelectContent>
        </Select>
      </form>

      <div class="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('admin.commissions.table.columns.referrer') }}</TableHead>
              <TableHead>{{ t('admin.commissions.table.columns.orderId') }}</TableHead>
              <TableHead>{{ t('admin.commissions.table.columns.orderAmount') }}</TableHead>
              <TableHead>{{ t('admin.commissions.table.columns.rate') }}</TableHead>
              <TableHead>{{ t('admin.commissions.table.columns.commission') }}</TableHead>
              <TableHead>{{ t('admin.commissions.table.columns.status') }}</TableHead>
              <TableHead>{{ t('admin.commissions.table.columns.date') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="loading">
              <TableCell :colspan="7" class="h-24 text-center">
                <Loader2 class="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </TableCell>
            </TableRow>
            <TableRow v-else-if="commissions.length === 0">
              <TableCell :colspan="7" class="h-24 text-center text-muted-foreground">
                {{ t('admin.commissions.noResults') }}
              </TableCell>
            </TableRow>
            <template v-else>
              <TableRow v-for="c in commissions" :key="c.id">
                <TableCell>
                  <div>
                    <div class="font-medium text-sm">{{ c.referrerName || '—' }}</div>
                    <div class="text-xs text-muted-foreground">{{ c.referrerEmail || '—' }}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <span class="font-mono text-xs text-muted-foreground">
                    {{ c.orderId ? `#${c.orderId.slice(-8)}` : '—' }}
                  </span>
                </TableCell>
                <TableCell class="text-sm">
                  {{ parseFloat(c.orderAmount).toFixed(2) }} {{ c.currency?.toUpperCase() }}
                </TableCell>
                <TableCell class="text-sm">{{ (parseFloat(c.commissionRate) * 100).toFixed(0) }}%</TableCell>
                <TableCell class="text-sm font-medium">
                  {{ parseFloat(c.commissionAmount).toFixed(2) }} {{ c.currency?.toUpperCase() }}
                </TableCell>
                <TableCell>
                  <Badge :variant="(statusVariantMap[c.status] || 'secondary') as any">
                    {{ t(`admin.commissions.filter.${c.status}`) || c.status }}
                  </Badge>
                </TableCell>
                <TableCell class="text-sm text-muted-foreground">
                  {{ new Date(c.createdAt).toLocaleDateString() }}
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </div>

      <div v-if="totalPages > 1" class="flex items-center justify-between">
        <span class="text-sm text-muted-foreground">
          {{ total }} {{ t('admin.commissions.total') }}
        </span>
        <Pagination :total="total" :items-per-page="pageSize" :page="page">
          <PaginationContent class="justify-center gap-2">
            <PaginationPrevious
              :disabled="page <= 1"
              @click="handlePageChange(page - 1)"
            />
            <span class="flex items-center px-3 text-sm text-muted-foreground">
              {{ page }} / {{ totalPages }}
            </span>
            <PaginationNext
              :disabled="page >= totalPages"
              @click="handlePageChange(page + 1)"
            />
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  </div>
</template>
