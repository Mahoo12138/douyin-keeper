import type { ColumnDef } from '@tanstack/vue-table'
import { h, resolveComponent } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'
import TooltipProvider from '@/components/ui/tooltip/TooltipProvider.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'
import { Copy, TrendingUp, TrendingDown, Gift, RotateCcw, Settings2, Bot, Cpu } from 'lucide-vue-next'
import type { Composer } from 'vue-i18n'
import SortableHeader from '@/components/admin/SortableHeader.vue'
import type { CreditTransaction } from '@libs/database/schema/credit-transaction'

// Credit transaction row type
export interface CreditTransactionRow extends CreditTransaction {
  userEmail?: string | null
  userName?: string | null
}

// Type config with icons
const getTypeConfig = (type: string) => {
  const configs: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any }> = {
    purchase: { variant: 'default', icon: TrendingUp },
    consumption: { variant: 'secondary', icon: TrendingDown },
    refund: { variant: 'secondary', icon: RotateCcw },
    bonus: { variant: 'outline', icon: Gift },
    adjustment: { variant: 'outline', icon: Settings2 },
  }
  return configs[type.toLowerCase()] || { variant: 'outline', icon: Settings2 }
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
const formatAmount = (amount: string) => {
  const numAmount = parseFloat(amount)
  if (isNaN(numAmount)) return amount
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numAmount)
}

// Copy to clipboard helper
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    console.log('Copied to clipboard:', text)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

// Table columns definition factory function
// Accepts t function from useI18n() to avoid calling useI18n() in render functions
export const createColumns = (t: Composer['t']): ColumnDef<CreditTransactionRow>[] => [
  {
    accessorKey: 'id',
    header: () => {
      return h('span', {}, t('admin.credits.table.columns.id'))
    },
    cell: ({ row }) => {
      const id = row.getValue('id') as string
      
      return h('div', { class: 'group relative' }, [
        h('div', {
          class: 'font-mono text-sm max-w-[100px] truncate cursor-pointer',
          title: id,
          onClick: () => copyToClipboard(id)
        }, `#${id.slice(-8)}`),
        h('div', {
          class: 'absolute z-50 hidden group-hover:block top-full left-0 pt-1'
        }, [
          h('div', {
            class: 'bg-popover text-popover-foreground shadow-md rounded-md border p-2 text-xs font-mono min-w-max'
          }, [
            h('div', { class: 'flex items-center gap-2' }, [
              h('span', { class: 'select-all' }, id),
              h('button', {
                class: 'p-1 hover:bg-accent rounded',
                onClick: () => copyToClipboard(id)
              }, h(Copy, { class: 'h-3 w-3' }))
            ]),
            h('div', { class: 'text-xs text-muted-foreground mt-1' }, t('admin.credits.table.actions.clickToCopy'))
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
        title: t('admin.credits.table.columns.user')
      })
    },
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
    enableHiding: false,
  },
  {
    accessorKey: 'type',
    header: () => {
      return h('span', {}, t('admin.credits.table.columns.type'))
    },
    cell: ({ row }) => {
      const type = row.getValue('type') as string
      const config = getTypeConfig(type)
      
      const typeLabels: Record<string, string> = {
        purchase: t('admin.credits.type.purchase'),
        consumption: t('admin.credits.type.consumption'),
        refund: t('admin.credits.type.refund'),
        bonus: t('admin.credits.type.bonus'),
        adjustment: t('admin.credits.type.adjustment'),
      }
      
      return h(Badge, { variant: config.variant, class: 'gap-1' }, () => [
        h(config.icon, { class: 'h-3 w-3' }),
        typeLabels[type] || type
      ])
    },
    enableHiding: false,
    enableSorting: false,
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.credits.table.columns.amount')
      })
    },
    cell: ({ row }) => {
      const amount = row.getValue('amount') as string
      const numAmount = parseFloat(amount)
      const isPositive = numAmount >= 0
      
      return h('div', { class: 'flex items-center gap-1 font-medium' }, [
        h(isPositive ? TrendingUp : TrendingDown, { class: 'h-3.5 w-3.5 text-muted-foreground' }),
        h('span', {}, `${isPositive ? '+' : ''}${formatAmount(amount)}`)
      ])
    },
    enableHiding: false,
  },
  {
    accessorKey: 'balance',
    header: () => {
      return h('span', {}, t('admin.credits.table.columns.balance'))
    },
    cell: ({ row }) => {
      const balance = row.getValue('balance') as string
      return h('div', { class: 'font-medium text-foreground' }, formatAmount(balance))
    },
    enableSorting: false,
  },
  {
    accessorKey: 'description',
    header: () => {
      return h('span', {}, t('admin.credits.table.columns.description'))
    },
    cell: ({ row }) => {
      const description = row.getValue('description') as string
      const metadata = row.original.metadata as Record<string, any> | null
      
      // Get translated description for type codes
      const displayDescription = t(`dashboard.credits.descriptions.${description}`, description) as string
      
      // Check if metadata has AI usage details
      const hasMetadata = metadata && (metadata.model || metadata.provider || metadata.totalTokens)
      
      if (!hasMetadata) {
        return h('div', {
          class: 'max-w-[250px] truncate text-sm',
          title: displayDescription || t('common.notAvailable')
        }, displayDescription || t('common.notAvailable'))
      }
      
      const triggerElement = h('div', { class: 'flex items-center gap-1.5 mt-1 text-xs text-muted-foreground cursor-help' }, [
        metadata.provider && h('span', { class: 'flex items-center gap-0.5' }, [
          h(Bot, { class: 'h-3 w-3' }),
          metadata.provider
        ]),
        metadata.model && h('span', { class: 'flex items-center gap-0.5' }, [
          h(Cpu, { class: 'h-3 w-3' }),
          metadata.model
        ])
      ])

      return h(TooltipProvider, {}, {
        default: () => h(Tooltip, {}, {
          default: () => [
            h('div', { class: 'max-w-[250px]' }, [
              h('div', {
                class: 'text-sm truncate',
                title: displayDescription || t('common.notAvailable')
              }, displayDescription || t('common.notAvailable')),
              h(TooltipTrigger, { asChild: true }, {
                default: () => triggerElement
              })
            ]),
            h(TooltipContent, { side: 'bottom', class: 'text-xs' }, {
              default: () => h('div', { class: 'space-y-1' }, [
                metadata.provider && h('div', {}, `Provider: ${metadata.provider}`),
                metadata.model && h('div', {}, `Model: ${metadata.model}`),
                metadata.inputTokens && h('div', {}, `Input tokens: ${metadata.inputTokens}`),
                metadata.outputTokens && h('div', {}, `Output tokens: ${metadata.outputTokens}`),
                metadata.totalTokens && h('div', {}, `Total tokens: ${metadata.totalTokens}`)
              ])
            })
          ]
        })
      })
    },
    enableSorting: false,
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.credits.table.columns.createdAt')
      })
    },
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as Date | string | null
      return h('div', { class: 'text-sm text-muted-foreground' }, formatDate(date))
    },
  },
]

// Export default columns for backward compatibility (will be created in component setup)
export const columns: ColumnDef<CreditTransactionRow>[] = []
