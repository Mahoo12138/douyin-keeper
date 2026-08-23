<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm" class="ml-auto hidden h-8 lg:flex">
        <SlidersHorizontal class="mr-2 h-4 w-4" />
        {{ $t('admin.subscriptions.table.view') }}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-[200px]">
      <DropdownMenuLabel>{{ $t('admin.subscriptions.table.toggleColumns') }}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        v-for="column in filteredColumns"
        :key="column.id"
        class="flex items-center justify-between"
        @select="(event: Event) => { event.preventDefault(); column.toggleVisibility() }"
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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Table } from '@tanstack/vue-table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Check, SlidersHorizontal } from 'lucide-vue-next'
import type { Subscription } from './columns'

// Component props
interface Props {
  table: Table<Subscription>
}

const props = defineProps<Props>()

// Internationalization
const { t } = useI18n()

// Define which columns should be toggleable (hidden by default)
const toggleableColumnIds = [
  'id',
  'periodStart',
  'periodEnd',
  'cancelAtPeriodEnd',
  'createdAt',
]

// Filter columns to only show toggleable ones
const filteredColumns = computed(() => {
  return props.table.getAllColumns().filter(
    (column: any) => 
      typeof column.accessorFn !== 'undefined' && 
      toggleableColumnIds.includes(column.id)
  )
})

// Get display name for column
const getColumnDisplayName = (columnId: string): string => {
  const columnMap: Record<string, string> = {
    id: t('admin.subscriptions.table.columns.id'),
    planId: t('admin.subscriptions.table.columns.plan'),
    paymentType: t('admin.subscriptions.table.columns.paymentType'),
    periodStart: t('admin.subscriptions.table.columns.periodStart'),
    periodEnd: t('admin.subscriptions.table.columns.periodEnd'),
    cancelAtPeriodEnd: t('admin.subscriptions.table.columns.cancelAtPeriodEnd'),
    createdAt: t('admin.subscriptions.table.columns.createdAt'),
  }
  
  return columnMap[columnId] || columnId
}
</script> 