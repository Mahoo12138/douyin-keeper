<template>
  <div class="space-y-4">
    <!-- Search and Filters -->
    <div class="flex items-center justify-between gap-4">
      <CreditsSearch />
      <CreditsColumnToggle :table="table" />
    </div>

    <!-- Data Table -->
    <div class="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <TableHead v-for="header in headerGroup.headers" :key="header.id">
              <FlexRender
                v-if="!header.isPlaceholder"
                :render="header.column.columnDef.header"
                :props="header.getContext()"
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="table.getRowModel().rows?.length">
            <TableRow
              v-for="row in table.getRowModel().rows"
              :key="row.id"
              :data-state="row.getIsSelected() ? 'selected' : undefined"
            >
              <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                <FlexRender
                  :render="cell.column.columnDef.cell"
                  :props="cell.getContext()"
                />
              </TableCell>
            </TableRow>
          </template>
          <template v-else>
            <TableRow>
              <TableCell :colSpan="columns.length" class="h-24 text-center">
                {{ t('admin.credits.table.noResults') }}
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </div>

    <!-- Simple Pagination -->
    <div v-if="pagination" class="flex items-center justify-between px-2">
      <div class="flex-1 text-sm text-muted-foreground">
        {{ t('admin.credits.table.pagination.showing', {
          start: (pagination.currentPage - 1) * pagination.pageSize + 1,
          end: Math.min(pagination.currentPage * pagination.pageSize, pagination.total),
          total: pagination.total
        }) }}
      </div>
      <div class="flex items-center space-x-6 lg:space-x-8">
        <div class="flex items-center space-x-2">
          <p class="text-sm font-medium">{{ t('admin.credits.table.pagination.pageInfo', {
            current: pagination.currentPage,
            total: pagination.totalPages
          }) }}</p>
        </div>
        <div class="flex items-center space-x-2">
          <Button
            variant="outline"
            class="h-8 w-8 p-0"
            :disabled="pagination.currentPage <= 1"
            @click="goToPage(1)"
          >
            <ChevronsLeft class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            class="h-8 w-8 p-0"
            :disabled="pagination.currentPage <= 1"
            @click="goToPage(pagination.currentPage - 1)"
          >
            <ChevronLeft class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            class="h-8 w-8 p-0"
            :disabled="pagination.currentPage >= pagination.totalPages"
            @click="goToPage(pagination.currentPage + 1)"
          >
            <ChevronRight class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            class="h-8 w-8 p-0"
            :disabled="pagination.currentPage >= pagination.totalPages"
            @click="goToPage(pagination.totalPages)"
          >
            <ChevronsRight class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  FlexRender,
  getCoreRowModel,
  useVueTable,
  type ColumnDef,
  type VisibilityState,
  type SortingState,
} from '@tanstack/vue-table'
import { ref, computed, watch } from 'vue'
import { createColumns, type CreditTransactionRow } from './columns'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-vue-next'

// Define props
interface Props {
  data: CreditTransactionRow[]
  pagination?: {
    currentPage: number
    totalPages: number
    pageSize: number
    total: number
  }
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'refresh-data': []
}>()

// Get composables
const { t } = useI18n()
const router = useRouter()
const route = useRoute()

// Local data state for real-time updates
const localData = ref<CreditTransactionRow[]>([...props.data])

// Watch for props changes and update local data
watch(() => props.data, (newData) => {
  localData.value = [...newData]
}, { deep: true })

// Table state - Load from localStorage or use defaults
const COLUMN_VISIBILITY_KEY = 'admin-credits-column-visibility'

const getInitialColumnVisibility = (): VisibilityState => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(COLUMN_VISIBILITY_KEY)
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error('Failed to parse saved column visibility:', e)
      }
    }
  }
  // Default visibility state
  return {
    id: false,
    balance: false,
    // description is visible by default
  }
}

const columnVisibility = ref<VisibilityState>(getInitialColumnVisibility())

// Watch and persist column visibility changes
watch(columnVisibility, (newValue) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(newValue))
  }
}, { deep: true })

// Initialize sorting from URL query parameters
const getInitialSorting = (): SortingState => {
  const sortBy = route.query.sortBy as string
  const sortDirection = route.query.sortDirection as string
  
  if (sortBy && sortDirection) {
    return [{
      id: sortBy,
      desc: sortDirection === 'desc'
    }]
  }
  return []
}

const sorting = ref<SortingState>(getInitialSorting())

// Watch route changes to update sorting state
watch(() => route.query, () => {
  sorting.value = getInitialSorting()
}, { deep: true })

// Create columns with i18n function
const columns = computed(() => createColumns(t))

// Create table instance
const table = useVueTable({
  get data() { return localData.value },
  get columns() { return columns.value },
  getCoreRowModel: getCoreRowModel(),
  onColumnVisibilityChange: (updater) => {
    const value = typeof updater === 'function' ? updater(columnVisibility.value) : updater
    columnVisibility.value = value
  },
  onSortingChange: (updater) => {
    const newSorting = typeof updater === 'function' ? updater(sorting.value) : updater
    sorting.value = newSorting
    
    // Update URL with new sorting parameters
    const query = { ...route.query }
    
    if (newSorting.length > 0 && newSorting[0]) {
      query.sortBy = newSorting[0].id
      query.sortDirection = newSorting[0].desc ? 'desc' : 'asc'
    } else {
      delete query.sortBy
      delete query.sortDirection
    }
    
    // Reset to first page when sorting changes
    query.page = '1'
    router.push({ query })
  },
  state: {
    get columnVisibility() { return columnVisibility.value },
    get sorting() { return sorting.value },
  },
  enableSorting: true,
})

// Pagination functionality
const goToPage = (page: number) => {
  if (page >= 1 && page <= (props.pagination?.totalPages || 1)) {
    const query = { ...route.query, page: page.toString() }
    router.push({ query })
  }
}
</script>

