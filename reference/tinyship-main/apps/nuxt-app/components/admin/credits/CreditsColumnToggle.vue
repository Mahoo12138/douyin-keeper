<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm" class="ml-auto h-8">
        <Settings2 class="mr-2 h-4 w-4" />
        {{ t('admin.users.table.search.view') }}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-[200px]">
      <DropdownMenuLabel>{{ t('admin.users.table.search.toggleColumns') }}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        v-for="column in toggleableColumns"
        :key="column.id"
        class="flex items-center justify-between"
        @select="(e: Event) => {
          e.preventDefault()
          column.toggleVisibility()
        }"
      >
        <span class="capitalize">
          {{ getColumnDisplayName(column.id) }}
        </span>
        <Check v-if="column.getIsVisible()" class="h-4 w-4" />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { Settings2, Check } from 'lucide-vue-next'
import type { Table } from '@tanstack/vue-table'
import type { CreditTransactionRow } from './columns'
import { computed } from 'vue'

// Define props
interface Props {
  table: Table<CreditTransactionRow>
}

const props = defineProps<Props>()

// Get composables
const { t } = useI18n()

// Define which columns should be toggleable
// Note: description is visible by default but can still be toggled
const toggleableColumnIds = [
  "id",
  "balance",
  "description", // Visible by default but can be toggled
]

// Get columns that can be toggled
const toggleableColumns = computed(() => {
  return props.table
    .getAllColumns()
    .filter(
      (column) =>
        typeof column.accessorFn !== "undefined" && 
        toggleableColumnIds.includes(column.id)
    )
})

// Column display name mapping
const getColumnDisplayName = (columnId: string) => {
  const columnNames: Record<string, string> = {
    id: t('admin.credits.table.columns.id'),
    user: t('admin.credits.table.columns.user'),
    type: t('admin.credits.table.columns.type'),
    amount: t('admin.credits.table.columns.amount'),
    balance: t('admin.credits.table.columns.balance'),
    description: t('admin.credits.table.columns.description'),
    createdAt: t('admin.credits.table.columns.createdAt'),
  }
  
  return columnNames[columnId] || columnId
}
</script>

