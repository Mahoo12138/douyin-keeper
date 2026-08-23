<script setup lang="ts">
import { Search, X, Loader2, CheckCircle, XCircle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const withdrawals = ref<any[]>([])
const loading = ref(true)
const page = ref(1)
const total = ref(0)
const searchValue = ref('')
const searchField = ref<'userEmail' | 'userName' | 'paymentAccount'>('userEmail')
const status = ref('all')
const processingId = ref<string | null>(null)
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
    const data = await $fetch<any>(`/api/admin/withdrawals?${params}`)
    withdrawals.value = data?.withdrawals || []
    total.value = data?.total || 0
  } catch (err) {
    console.error('Failed to fetch withdrawals:', err)
  } finally {
    loading.value = false
  }
}

const totalPages = computed(() => Math.ceil(total.value / pageSize))

const statusVariantMap: Record<string, string> = {
  completed: 'default',
  pending: 'secondary',
  processing: 'outline',
  rejected: 'destructive',
}

const searchFieldLabels = computed(() => ({
  userEmail: t('admin.withdrawals.table.columns.userEmail'),
  userName: t('admin.withdrawals.table.columns.userName'),
  paymentAccount: t('admin.withdrawals.table.columns.paymentAccount'),
}))

async function handleProcess(id: string, newStatus: 'completed' | 'rejected') {
  processingId.value = id
  try {
    const note = newStatus === 'rejected' ? prompt(t('admin.withdrawals.dialog.notePlaceholder')) : undefined
    await $fetch(`/api/admin/withdrawals/${id}`, {
      method: 'PATCH',
      body: { status: newStatus, adminNote: note || undefined },
    })
    toast.success(newStatus === 'completed' ? t('admin.withdrawals.actions.approve') : t('admin.withdrawals.actions.reject'))
    await fetchData()
  } catch {
    toast.error('Failed to process withdrawal')
  } finally {
    processingId.value = null
  }
}

function handleSearch() {
  page.value = 1
  fetchData()
}

function handleClear() {
  searchValue.value = ''
  searchField.value = 'userEmail'
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
    <h1 class="text-2xl font-bold mb-6">{{ t('admin.withdrawals.title') }}</h1>

    <div class="space-y-4">
      <form class="flex items-center gap-2 flex-wrap" @submit.prevent="handleSearch">
        <Select :model-value="searchField" @update:model-value="handleFieldChange">
          <SelectTrigger class="w-[140px]">
            <SelectValue :placeholder="t('admin.withdrawals.table.search.searchBy')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="userEmail">{{ searchFieldLabels.userEmail }}</SelectItem>
            <SelectItem value="userName">{{ searchFieldLabels.userName }}</SelectItem>
            <SelectItem value="paymentAccount">{{ searchFieldLabels.paymentAccount }}</SelectItem>
          </SelectContent>
        </Select>

        <Input
          v-model="searchValue"
          :placeholder="t('admin.withdrawals.table.search.searchPlaceholder', { field: searchFieldLabels[searchField] })"
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
            <SelectValue :placeholder="t('admin.withdrawals.filter.filterByStatus')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{{ t('admin.withdrawals.filter.allStatus') }}</SelectItem>
            <SelectItem value="pending">{{ t('admin.withdrawals.filter.pending') }}</SelectItem>
            <SelectItem value="processing">{{ t('admin.withdrawals.filter.processing') }}</SelectItem>
            <SelectItem value="completed">{{ t('admin.withdrawals.filter.completed') }}</SelectItem>
            <SelectItem value="rejected">{{ t('admin.withdrawals.filter.rejected') }}</SelectItem>
          </SelectContent>
        </Select>
      </form>

      <div class="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('admin.withdrawals.table.columns.user') }}</TableHead>
              <TableHead>{{ t('admin.withdrawals.table.columns.amount') }}</TableHead>
              <TableHead>{{ t('admin.withdrawals.table.columns.method') }}</TableHead>
              <TableHead>{{ t('admin.withdrawals.table.columns.paymentAccount') }}</TableHead>
              <TableHead>{{ t('admin.withdrawals.table.columns.status') }}</TableHead>
              <TableHead>{{ t('admin.withdrawals.table.columns.date') }}</TableHead>
              <TableHead>{{ t('admin.withdrawals.table.columns.actions') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="loading">
              <TableCell :colspan="7" class="h-24 text-center">
                <Loader2 class="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </TableCell>
            </TableRow>
            <TableRow v-else-if="withdrawals.length === 0">
              <TableCell :colspan="7" class="h-24 text-center text-muted-foreground">
                {{ t('admin.withdrawals.noResults') }}
              </TableCell>
            </TableRow>
            <template v-else>
              <TableRow v-for="w in withdrawals" :key="w.id">
                <TableCell>
                  <div>
                    <div class="font-medium text-sm">{{ w.userName || '—' }}</div>
                    <div class="text-xs text-muted-foreground">{{ w.userEmail || '—' }}</div>
                  </div>
                </TableCell>
                <TableCell class="text-sm font-medium">
                  {{ parseFloat(w.amount).toFixed(2) }} {{ w.currency?.toUpperCase() }}
                </TableCell>
                <TableCell class="text-sm">{{ w.paymentMethod }}</TableCell>
                <TableCell class="text-sm text-muted-foreground max-w-[150px] truncate" :title="w.paymentAccount">
                  {{ w.paymentAccount }}
                </TableCell>
                <TableCell>
                  <Badge :variant="(statusVariantMap[w.status] || 'secondary') as any">
                    {{ t(`admin.withdrawals.filter.${w.status}`) || w.status }}
                  </Badge>
                </TableCell>
                <TableCell class="text-sm text-muted-foreground">
                  {{ new Date(w.createdAt).toLocaleDateString() }}
                </TableCell>
                <TableCell>
                  <div v-if="w.status === 'pending'" class="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      class="h-7 text-xs"
                      :disabled="processingId === w.id"
                      @click="handleProcess(w.id, 'completed')"
                    >
                      <CheckCircle class="h-3 w-3 mr-1" />
                      {{ t('admin.withdrawals.actions.approve') }}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      class="h-7 text-xs text-destructive hover:text-destructive"
                      :disabled="processingId === w.id"
                      @click="handleProcess(w.id, 'rejected')"
                    >
                      <XCircle class="h-3 w-3 mr-1" />
                      {{ t('admin.withdrawals.actions.reject') }}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </div>

      <div v-if="totalPages > 1" class="flex items-center justify-between">
        <span class="text-sm text-muted-foreground">
          {{ total }} {{ t('admin.withdrawals.total') }}
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
