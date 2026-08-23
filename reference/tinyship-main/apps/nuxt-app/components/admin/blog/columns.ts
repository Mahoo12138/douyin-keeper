import type { ColumnDef } from '@tanstack/vue-table'
import { h } from 'vue'
import { Badge } from '@/components/ui/badge'
import type { Composer } from 'vue-i18n'
import SortableHeader from '@/components/admin/SortableHeader.vue'
import BlogActionsCell from '@/components/admin/blog/BlogActionsCell.vue'

/** Blog post row type from admin API */
export interface BlogPost {
  id: string
  title: string
  slug: string
  status: string
  authorName: string | null
  publishedAt: Date | string | null
  createdAt: Date | string | null
}

/** Status badge variant mapping */
const getStatusVariant = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'published':
      return 'default'
    case 'draft':
      return 'outline'
    default:
      return 'outline'
  }
}

/** Format date for display */
const formatDate = (date: Date | string | null) => {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Column definitions factory - accepts t from useI18n() for translations */
export const createColumns = (t: Composer['t']): ColumnDef<BlogPost>[] => [
  {
    accessorKey: 'title',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.blog.table.columns.title'),
        ascendingText: t('admin.users.table.sort.ascending'),
        descendingText: t('admin.users.table.sort.descending'),
        noneText: t('admin.users.table.sort.none'),
      })
    },
    enableHiding: false,
    cell: ({ row }) => {
      const title = row.getValue('title') as string
      return h('div', { class: 'font-medium max-w-[200px] truncate', title }, title)
    },
  },
  {
    accessorKey: 'status',
    header: () => h('span', {}, t('admin.blog.table.columns.status')),
    enableHiding: false,
    cell: ({ row }) => {
      const status = row.getValue('status') as string
      const statusTranslations: Record<string, string> = {
        draft: t('admin.blog.table.search.draft'),
        published: t('admin.blog.table.search.published'),
      }
      return h(Badge, { variant: getStatusVariant(status) }, () =>
        statusTranslations[status?.toLowerCase()] || status,
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'authorName',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.blog.table.columns.author'),
        ascendingText: t('admin.users.table.sort.ascending'),
        descendingText: t('admin.users.table.sort.descending'),
        noneText: t('admin.users.table.sort.none'),
      })
    },
    cell: ({ row }) => {
      const name = row.getValue('authorName') as string | null
      return h('div', { class: 'text-sm' }, name || t('common.notAvailable'))
    },
  },
  {
    accessorKey: 'publishedAt',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.blog.table.columns.publishedAt'),
        ascendingText: t('admin.users.table.sort.ascending'),
        descendingText: t('admin.users.table.sort.descending'),
        noneText: t('admin.users.table.sort.none'),
      })
    },
    cell: ({ row }) => {
      const date = row.getValue('publishedAt') as Date | string | null
      return h('div', { class: 'text-sm text-muted-foreground' }, formatDate(date))
    },
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.blog.table.columns.createdAt'),
        ascendingText: t('admin.users.table.sort.ascending'),
        descendingText: t('admin.users.table.sort.descending'),
        noneText: t('admin.users.table.sort.none'),
      })
    },
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as Date | string | null
      return h('div', { class: 'text-sm text-muted-foreground' }, formatDate(date))
    },
  },
  {
    id: 'actions',
    header: () => h('div', { class: 'text-right' }, t('admin.blog.table.columns.actions')),
    enableHiding: false,
    cell: ({ row, table }) => {
      const post = row.original
      const meta = table.options.meta as { onPostDeleted?: (id: string) => void } | undefined
      return h(BlogActionsCell, {
        post,
        'onPost-deleted': meta?.onPostDeleted,
      })
    },
    enableSorting: false,
  },
]
