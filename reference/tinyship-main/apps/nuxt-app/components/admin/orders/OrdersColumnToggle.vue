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
        v-for="column in hiddenColumns"
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
import type { Order } from './columns'
import { computed } from 'vue'

// Define props
interface Props {
  table: Table<Order>
}

const props = defineProps<Props>()

// Get composables
const { t } = useI18n()

// Define which columns should be toggleable (hidden by default)
const hiddenColumnIds = [
  "id",
  "planId",
  "providerOrderId", 
  "createdAt",
  "updatedAt",
]

// Get columns that can be toggled
const hiddenColumns = computed(() => {
  return props.table
    .getAllColumns()
    .filter(
      (column) =>
        typeof column.accessorFn !== "undefined" && 
        hiddenColumnIds.includes(column.id)
    )
})

// Column display name mapping
const getColumnDisplayName = (columnId: string) => {
  const columnNames: Record<string, string> = {
    id: t('admin.orders.table.columns.id'),
    userEmail: t('admin.orders.table.columns.user'),
    amount: t('admin.orders.table.columns.amount'),
    planId: t('admin.orders.table.columns.plan'),
    status: t('admin.orders.table.columns.status'),
    provider: t('admin.orders.table.columns.provider'),
    providerOrderId: t('admin.orders.table.columns.providerOrderId'),
    createdAt: t('admin.orders.table.columns.createdAt'),
    updatedAt: t('admin.orders.table.columns.updatedAt'),
    actions: t('admin.orders.table.columns.actions')
  }
  
  return columnNames[columnId] || columnId
}
</script> 