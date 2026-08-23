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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Settings2, Check } from 'lucide-vue-next'
import type { Table } from '@tanstack/vue-table'
import type { BlogPost } from './columns'
import { computed } from 'vue'

interface Props {
  table: Table<BlogPost>
}

const props = defineProps<Props>()

const { t } = useI18n()

const hiddenColumnIds = ['publishedAt', 'createdAt']

const hiddenColumns = computed(() => {
  return props.table
    .getAllColumns()
    .filter(
      (column) =>
        typeof column.accessorFn !== 'undefined' && hiddenColumnIds.includes(column.id),
    )
})

const getColumnDisplayName = (columnId: string) => {
  const columnNames: Record<string, string> = {
    title: t('admin.blog.table.columns.title'),
    status: t('admin.blog.table.columns.status'),
    authorName: t('admin.blog.table.columns.author'),
    publishedAt: t('admin.blog.table.columns.publishedAt'),
    createdAt: t('admin.blog.table.columns.createdAt'),
    actions: t('admin.blog.table.columns.actions'),
  }
  return columnNames[columnId] || columnId
}
</script>
