<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm" class="ml-auto h-8">
        <Settings2 class="mr-2 h-4 w-4" />
        {{ $t('admin.users.table.search.view') }}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-[180px]">
      <DropdownMenuLabel>{{ $t('admin.users.table.search.toggleColumns') }}</DropdownMenuLabel>
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
          {{ getColumnTitle(column.id) }}
        </span>
        <Check v-if="column.getIsVisible()" class="h-4 w-4" />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import type { Table } from '@tanstack/vue-table'
import { Settings2, Check } from 'lucide-vue-next'
import { computed } from 'vue'

interface Props {
  table: Table<any>
}

const props = defineProps<Props>()
const { t } = useI18n()

// Define which columns should be toggleable (hidden by default)
const hiddenColumnIds = [
  "id",
  "phoneNumber",
  "emailVerified",
  "referralCode",
  "referredByCode",
  "commissionBalance",
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

// Get translated column title
const getColumnTitle = (columnId: string) => {
  const columnTitles: Record<string, string> = {
    id: t('admin.users.table.columns.id'),
    phoneNumber: t('admin.users.table.columns.phoneNumber'),
    emailVerified: t('admin.users.table.columns.emailVerified'),
    referralCode: t('admin.users.table.columns.referralCode'),
    referredByCode: t('admin.users.table.columns.referredByCode'),
    commissionBalance: t('admin.users.table.columns.commissionBalance'),
    createdAt: t('admin.users.table.columns.createdAt'),
    updatedAt: t('admin.users.table.columns.updatedAt'),
  }
  
  return columnTitles[columnId] || columnId
}
</script> 