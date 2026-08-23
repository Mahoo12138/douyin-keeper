import { h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { Copy } from 'lucide-vue-next'
import type { Composer } from 'vue-i18n'
import UsersActionsCell from '@/components/admin/users/UsersActionsCell.vue'
import UsersBannedCell from '@/components/admin/users/UsersBannedCell.vue'
import UsersRoleCell from '@/components/admin/users/UsersRoleCell.vue'
import SortableHeader from '@/components/admin/SortableHeader.vue'

// User type definition based on the API response
export interface User {
  id: string
  name: string | null
  email: string
  role: string // Changed from 'admin' | 'user' to string to match API
  emailVerified: boolean
  banned: boolean | null // Changed to match API (can be null)
  createdAt: string | Date // Can be Date from API
  updatedAt: string | Date // Can be Date from API
}

// Table columns definition factory function
// Accepts t function from useI18n() to avoid calling useI18n() in render functions
export const createColumns = (t: Composer['t']): ColumnDef<User>[] => [
  // ID Column (hidden by default, no sorting needed)
  {
    accessorKey: 'id',
    header: () => {
      return <span>{t('admin.users.table.columns.id')}</span>
    },
    cell: ({ row }) => {
      const id = row.getValue('id') as string
      
      // Create tooltip content with copy functionality
      const copyToClipboard = async () => {
        try {
          await navigator.clipboard.writeText(id)
          // You could add a toast notification here
          console.log('ID copied to clipboard:', id)
        } catch (err) {
          console.error('Failed to copy ID:', err)
        }
      }
      
      return (
        <div class="group relative">
          {/* Main ID display */}
          <div 
            class="font-mono text-xs w-[180px] truncate cursor-pointer"
            onClick={copyToClipboard}
          >
            {id}
          </div>
          
          {/* Tooltip that appears on hover */}
          <div class="absolute z-50 hidden group-hover:block top-full left-0 pt-1">
            <div class="bg-popover text-popover-foreground shadow-md rounded-md border p-2 text-xs font-mono min-w-max">
              <div class="flex items-center gap-2">
                <span class="select-all">{id}</span>
                <button
                  class="p-1 hover:bg-accent rounded"
                  onClick={copyToClipboard}
                >
                  <Copy class="h-3 w-3" />
                </button>
              </div>
              <div class="text-xs text-muted-foreground mt-1">Click to copy</div>
            </div>
          </div>
        </div>
      )
    },
    enableSorting: false,
  },
  
  // Name Column (sortable - useful for alphabetical order)
  {
    accessorKey: 'name',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.users.table.columns.name'),
        ascendingText: t('admin.users.table.sort.ascending'),
        descendingText: t('admin.users.table.sort.descending'),
        noneText: t('admin.users.table.sort.none')
      })
    },
    cell: ({ row }) => {
      const name = row.getValue('name') as string | null
      return <div class="font-medium">{name || 'N/A'}</div>
    },
  },
  
  // Email Column (sortable - useful for alphabetical order)
  {
    accessorKey: 'email',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.users.table.columns.email'),
        ascendingText: t('admin.users.table.sort.ascending'),
        descendingText: t('admin.users.table.sort.descending'),
        noneText: t('admin.users.table.sort.none')
      })
    },
    cell: ({ row }) => {
      const email = row.getValue('email') as string
      return <div class="text-sm">{email}</div>
    },
  },
  
  // Role Column (with dropdown to change role)
  {
    accessorKey: 'role',
    header: () => {
      return <span>{t('admin.users.table.columns.role')}</span>
    },
    cell: ({ row, table }) => {
      const currentRole = row.getValue('role') as string
      const userId = row.getValue('id') as string
      
      // Get the onUserUpdated function from table meta
      const meta = table.options.meta as any
      const onUserUpdated = meta?.onUserUpdated
      
      return h(UsersRoleCell, { 
        currentRole,
        userId,
        onUserUpdated
      })
    },
    enableSorting: false,
  },
  
  // Phone Number Column
  {
    accessorKey: 'phoneNumber',
    header: () => {
      return <span>{t('admin.users.table.columns.phoneNumber')}</span>
    },
    cell: ({ row }) => {
      const phoneNumber = row.getValue('phoneNumber') as string | null
      return <div class="text-sm text-muted-foreground">{phoneNumber || 'N/A'}</div>
    },
    enableSorting: false,
  },
  
  // Email Verified Column (no sorting needed - just status display)
  {
    accessorKey: 'emailVerified',
    header: () => {
      return <span>{t('admin.users.table.columns.emailVerified')}</span>
    },
    cell: ({ row }) => {
      const verified = row.getValue('emailVerified') as boolean
      
      if (verified) {
        return (
          <div class="text-foreground">
            ✓ Verified
          </div>
        )
      }
      
      return (
        <div class="text-muted-foreground">
          ✗ Not verified
        </div>
      )
    },
    enableSorting: false,
  },
  
  // Banned Status Column (with toggle switch)
  {
    accessorKey: 'banned',
    header: () => {
      return <span>{t('admin.users.table.columns.banned')}</span>
    },
    cell: ({ row, table }) => {
      const bannedValue = row.getValue('banned') as boolean | null
      // Convert null to false for the switch (null means not banned)
      const isBanned = bannedValue === true
      const userId = row.getValue('id') as string
      
      // Get the onUserUpdated function from table meta to update local data
      const meta = table.options.meta as any
      const onUserUpdated = meta?.onUserUpdated
      
      return h(UsersBannedCell, { 
        value: isBanned,
        userId,
        onUserUpdated
      })
    },
    enableSorting: false,
  },
  
  // Referral Code Column
  {
    accessorKey: 'referralCode',
    header: () => <span>{t('admin.users.table.columns.referralCode')}</span>,
    cell: ({ row }) => {
      const code = row.getValue('referralCode') as string | null
      return <div class="font-mono text-xs text-muted-foreground">{code || '—'}</div>
    },
    enableSorting: false,
  },

  // Referred By Column
  {
    accessorKey: 'referredByCode',
    header: () => <span>{t('admin.users.table.columns.referredByCode')}</span>,
    cell: ({ row }) => {
      const referredBy = (row.original as any).referredBy as { name: string | null; email: string } | null
      if (!referredBy) return <div class="text-muted-foreground">—</div>
      return (
        <div class="text-xs">
          <div class="font-medium">{referredBy.name || '—'}</div>
          <div class="text-muted-foreground">{referredBy.email}</div>
        </div>
      )
    },
    enableSorting: false,
  },

  // Commission Balance Column
  {
    accessorKey: 'commissionBalance',
    header: () => <span>{t('admin.users.table.columns.commissionBalance')}</span>,
    cell: ({ row }) => {
      const balance = row.getValue('commissionBalance') as string | null
      const num = parseFloat(balance || '0')
      return (
        <div class={`text-sm font-medium ${num > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
          {num.toFixed(2)}
        </div>
      )
    },
    enableSorting: false,
  },

  // Created At Column (sortable - very useful for chronological order)
  {
    accessorKey: 'createdAt',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.users.table.columns.createdAt'),
        ascendingText: t('admin.users.table.sort.ascending'),
        descendingText: t('admin.users.table.sort.descending'),
        noneText: t('admin.users.table.sort.none')
      })
    },
    cell: ({ row }) => {
      const createdAt = row.getValue('createdAt') as string | Date
      const date = new Date(createdAt)
      const formatted = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
      return <div class="text-sm text-muted-foreground">{formatted}</div>
    },
  },
  
  // Updated At Column (sortable - useful to see recent activity)
  {
    accessorKey: 'updatedAt',
    header: ({ column }) => {
      return h(SortableHeader, {
        column,
        title: t('admin.users.table.columns.updatedAt'),
        ascendingText: t('admin.users.table.sort.ascending'),
        descendingText: t('admin.users.table.sort.descending'),
        noneText: t('admin.users.table.sort.none')
      })
    },
    cell: ({ row }) => {
      const updatedAt = row.getValue('updatedAt') as string | Date
      const date = new Date(updatedAt)
      const formatted = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
      return <div class="text-sm text-muted-foreground">{formatted}</div>
    },
  },
  
  // Actions Column (no sorting)
  {
    id: 'actions',
    header: () => {
      return <div class="text-center">{t('admin.users.table.columns.actions')}</div>
    },
    cell: ({ row, table }) => {
      const user = row.original
      
      // Get the onUserUpdated and onUserDeleted functions from table meta
      const meta = table.options.meta as any
      const onUserUpdated = meta?.onUserUpdated
      const onUserDeleted = meta?.onUserDeleted
      
      return h('div', { class: 'flex justify-center' }, 
        h(UsersActionsCell, { 
          user,
          'onUser-updated': onUserUpdated,
          'onUser-deleted': onUserDeleted
        })
      )
    },
    enableSorting: false,
    enableHiding: false,
  },
]

// Export default columns for backward compatibility (will be created in component setup)
export const columns: ColumnDef<User>[] = [] 