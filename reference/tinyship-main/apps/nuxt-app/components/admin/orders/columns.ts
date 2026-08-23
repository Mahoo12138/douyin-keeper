import type { ColumnDef } from '@tanstack/vue-table'
import { h } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, ExternalLink, RefreshCw, Copy } from 'lucide-vue-next'
import type { Composer } from 'vue-i18n'
import SortableHeader from '@/components/admin/SortableHeader.vue'

// Order type definition
export interface Order {
  id: string
  userId: string | null
  amount: string
  currency: string
  planId: string | null
  status: string
  provider: string
  providerOrderId: string | null
  metadata?: any
  createdAt: Date | null
  updatedAt: Date | null
  // Associated user information
  userName: string | null
  userEmail: string | null
}

// Status badge variants
const getStatusVariant = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid':
      return 'default'
    case 'pending':
      return 'outline'
    case 'failed':
      return 'destructive'
    case 'refunded':
      return 'secondary'
    case 'canceled':
      return 'secondary'
    default:
      return 'outline'
  }
}

// Provider display helper
const getProviderDisplay = (provider: string) => {
  switch (provider.toLowerCase()) {
    case 'stripe':
      return 'Stripe'
    case 'wechat':
      return 'WeChat Pay'
    case 'creem':
      return 'Creem'
    default:
      return provider
  }
}

// Format date helper
const formatDate = (date: Date | string | null) => {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Format amount helper
const formatAmount = (amount: string, currency: string) => {
  const numAmount = parseFloat(amount)
  if (isNaN(numAmount)) return `${currency} ${amount}`
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2
  }).format(numAmount)
}

// Table columns definition factory function
// Accepts t function from useI18n() to avoid calling useI18n() in render functions
export const createColumns = (t: Composer['t']): ColumnDef<Order>[] => [
  {
    accessorKey: 'id',
    header: () => {
      return h('span', {}, t('admin.orders.table.columns.id'))
    },
    cell: ({ row }) => {
      const id = row.getValue('id') as string
      
      // Create copy functionality
      const copyToClipboard = async () => {
        try {
          await navigator.clipboard.writeText(id)
          console.log('Order ID copied to clipboard:', id)
        } catch (err) {
          console.error('Failed to copy Order ID:', err)
        }
      }
      
      return h('div', { class: 'group relative' }, [
        // Main ID display
        h('div', { 
          class: 'font-mono text-sm max-w-[100px] truncate cursor-pointer',
          title: id,
          onClick: copyToClipboard
        }, `#${id.slice(-8)}`),
        
        // Tooltip
        h('div', { class: 'absolute z-50 hidden group-hover:block top-full left-0 pt-1' }, [
          h('div', { class: 'bg-popover text-popover-foreground shadow-md rounded-md border p-2 text-xs font-mono min-w-max' }, [
            h('div', { class: 'flex items-center gap-2' }, [
              h('span', { class: 'select-all' }, id),
              h('button', { 
                class: 'p-1 hover:bg-accent rounded',
                onClick: copyToClipboard 
              }, [
                h(Copy, { class: 'h-3 w-3' })
              ])
            ]),
            h('div', { class: 'text-xs text-muted-foreground mt-1' }, t('admin.orders.table.actions.clickToCopy'))
          ])
        ])
      ])
    },
    enableSorting: false,
  },
  {
    accessorKey: 'userEmail',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.orders.table.columns.user'),
        ascendingText: t('admin.users.table.sort.ascending'),
        descendingText: t('admin.users.table.sort.descending'),
        noneText: t('admin.users.table.sort.none')
      })
    },
    enableHiding: false,
    cell: ({ row }) => {
      const email = row.getValue('userEmail') as string
      const name = row.original.userName
      return h('div', { class: 'max-w-[150px]' }, [
        h('div', { 
          class: 'font-medium truncate text-foreground',
          title: name || t('common.notAvailable') 
        }, name || t('common.notAvailable')),
        h('div', { 
          class: 'text-sm text-muted-foreground truncate',
          title: email || t('common.notAvailable') 
        }, email || t('common.notAvailable'))
      ])
    },
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.orders.table.columns.amount'),
        ascendingText: t('admin.users.table.sort.ascending'),
        descendingText: t('admin.users.table.sort.descending'),
        noneText: t('admin.users.table.sort.none')
      })
    },
    enableHiding: false,
    cell: ({ row }) => {
      const amount = row.getValue('amount') as string
      const currency = row.original.currency
      return h('div', { class: 'font-medium text-foreground' }, 
        formatAmount(amount, currency)
      )
    },
  },
  {
    accessorKey: 'planId',
    header: () => {
      return h('span', {}, t('admin.orders.table.columns.plan'))
    },
    cell: ({ row }) => {
      const planId = row.getValue('planId') as string
      return h('div', { class: 'font-medium' }, planId || t('common.notAvailable'))
    },
    enableSorting: false,
  },
  {
    accessorKey: 'status',
    header: () => {
      return h('span', {}, t('admin.orders.table.columns.status'))
    },
    enableHiding: false,
    cell: ({ row }) => {
      const status = row.getValue('status') as string
      
      // Get translated status text
      const statusTranslations: Record<string, string> = {
        pending: t('admin.orders.status.pending'),
        paid: t('admin.orders.status.paid'),
        failed: t('admin.orders.status.failed'),
        refunded: t('admin.orders.status.refunded'),
        canceled: t('admin.orders.status.canceled')
      }
      return h(Badge, { 
        variant: getStatusVariant(status) 
      }, () => statusTranslations[status.toLowerCase()] || status.charAt(0).toUpperCase() + status.slice(1))
    },
    enableSorting: false,
  },
  {
    accessorKey: 'provider',
    header: () => {
      return h('span', {}, t('admin.orders.table.columns.provider'))
    },
    enableHiding: false,
    cell: ({ row }) => {
      const provider = row.getValue('provider') as string
      return h('div', { class: 'font-medium' }, getProviderDisplay(provider))
    },
    enableSorting: false,
  },
  {
    accessorKey: 'providerOrderId',
    header: () => {
      return h('span', {}, t('admin.orders.table.columns.providerOrderId'))
    },
    cell: ({ row }) => {
      const providerOrderId = row.getValue('providerOrderId') as string
      return h('div', { 
        class: 'font-mono text-xs max-w-[120px] truncate',
        title: providerOrderId || t('common.notAvailable') 
      }, providerOrderId || t('common.notAvailable'))
    },
    enableSorting: false,
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.orders.table.columns.createdAt'),
        ascendingText: t('admin.users.table.sort.ascending'),
        descendingText: t('admin.users.table.sort.descending'),
        noneText: t('admin.users.table.sort.none')
      })
    },
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as Date | string | null
      return h('div', { class: 'text-sm text-muted-foreground' }, formatDate(date))
    },
  },
  // {
  //   id: 'actions',
  //   header: () => {
  //     const { t } = useI18n()
  //     return h('div', { class: 'text-center' }, t('admin.orders.table.columns.actions'))
  //   },
  //   enableHiding: false,
  //   cell: ({ row, table }) => {
  //     const { t } = useI18n()
  //     const order = row.original

  //     return h(DropdownMenu, {}, {
  //       default: () => [
  //         h(DropdownMenuTrigger, { asChild: true }, {
  //           default: () => h(Button, { 
  //             variant: 'ghost', 
  //             class: 'h-8 w-8 p-0' 
  //           }, {
  //             default: () => [
  //               h('span', { class: 'sr-only' }, t('admin.orders.table.actions.openMenu')),
  //               h(MoreHorizontal, { class: 'h-4 w-4' })
  //             ]
  //           })
  //         }),
  //         h(DropdownMenuContent, { align: 'end' }, {
  //           default: () => [
  //             h(DropdownMenuLabel, {}, { default: () => t('admin.orders.table.actions.actions') }),
  //             h(DropdownMenuItem, { 
  //               onClick: () => {
  //                 // TODO: Implement view order functionality
  //                 console.log('View order:', order.id)
  //               }
  //             }, {
  //               default: () => [
  //                 h(ExternalLink, { class: 'mr-2 h-4 w-4' }),
  //                 t('admin.orders.table.actions.viewOrder')
  //               ]
  //             }),
  //             h(DropdownMenuItem, { 
  //               onClick: () => {
  //                 // TODO: Implement refund functionality
  //                 console.log('Refund order:', order.id)
  //               },
  //               disabled: order.status !== 'paid'
  //             }, {
  //               default: () => [
  //                 h(RefreshCw, { class: 'mr-2 h-4 w-4' }),
  //                 t('admin.orders.table.actions.refundOrder')
  //               ]
  //             })
  //           ]
  //         })
  //       ]
  //     })
  //   },
  //   enableSorting: false,
  // },
]

// Export default columns for backward compatibility (will be created in component setup)
export const columns: ColumnDef<Order>[] = [] 