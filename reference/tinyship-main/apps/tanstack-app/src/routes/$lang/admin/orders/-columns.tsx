import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@libs/react-shared/ui/badge"
import { Button } from "@libs/react-shared/ui/button"
import { ArrowUpDown, Copy, ArrowUp, ArrowDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@libs/react-shared/ui/dropdown-menu"
import { useTranslation } from "@/hooks/use-translation"

export type Order = {
  id: string
  userId: string
  amount: string
  currency: string
  planId: string
  status: string
  provider: string
  providerOrderId?: string | null
  metadata?: any
  createdAt: string | Date
  updatedAt?: string | Date
  userName?: string | null
  userEmail?: string | null
}

const getStatusBadge = (status: string, t: any) => {
  const statusConfig = {
    pending: { label: t.admin.orders.table.search.pending, variant: "secondary" as const },
    paid: { label: t.admin.orders.table.search.paid, variant: "default" as const },
    failed: { label: t.admin.orders.table.search.failed, variant: "destructive" as const },
    refunded: { label: t.admin.orders.table.search.refunded, variant: "outline" as const },
    canceled: { label: t.admin.orders.table.search.canceled, variant: "secondary" as const },
  }

  const config = statusConfig[status as keyof typeof statusConfig] || { label: status, variant: "outline" as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

const getProviderBadge = (provider: string, t: any) => {
  const providerConfig = {
    stripe: { label: t.admin.orders.table.search.stripe, variant: "outline" as const },
    wechat: { label: t.admin.orders.table.search.wechat, variant: "outline" as const },
    creem: { label: t.admin.orders.table.search.creem, variant: "outline" as const },
  }

  const config = providerConfig[provider as keyof typeof providerConfig] || { label: provider, variant: "outline" as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

const formatDate = (date: string | Date | null) => {
  if (!date) return 'N/A'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatAmount = (amount: string, currency: string) => {
  const numAmount = parseFloat(amount)
  if (isNaN(numAmount)) return `${currency} ${amount}`

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2
  }).format(numAmount)
}

const SortableHeader = ({ column, title, t }: { column: any; title: string; t: any }) => {
  const sortDirection = column.getIsSorted()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto p-0 font-medium hover:bg-transparent hover:text-accent-foreground flex items-center"
        >
          {title}
          <div className="ml-2 flex flex-col">
            {sortDirection === "asc" ? (
              <ArrowUp className="h-3 w-3" />
            ) : sortDirection === "desc" ? (
              <ArrowDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3" />
            )}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
          <ArrowUp className="mr-2 h-4 w-4" />
          {t.admin.orders.table.sort.ascending}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          <ArrowDown className="mr-2 h-4 w-4" />
          {t.admin.orders.table.sort.descending}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => column.clearSorting()}>
          <ArrowUpDown className="mr-2 h-4 w-4" />
          {t.admin.orders.table.sort.none}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const useOrderColumns = (): ColumnDef<Order>[] => {
  const { t } = useTranslation()

  return [
    {
      accessorKey: "id",
      header: t.admin.orders.table.columns.id,
      cell: ({ row }) => {
        const id = row.getValue("id") as string

        const copyToClipboard = async () => {
          try {
            await navigator.clipboard.writeText(id)
          } catch (err) {
            console.error('Failed to copy Order ID:', err)
          }
        }

        return (
          <div className="group relative">
            <div
              className="font-mono text-sm max-w-[100px] truncate cursor-pointer"
              title={id}
              onClick={copyToClipboard}
            >
              #{id.slice(-8)}
            </div>
            <div className="absolute z-50 hidden group-hover:block top-full left-0 pt-1">
              <div className="bg-popover text-popover-foreground shadow-md rounded-md border p-2 text-xs font-mono min-w-max">
                <div className="flex items-center gap-2">
                  <span className="select-all">{id}</span>
                  <button className="p-1 hover:bg-accent rounded" onClick={copyToClipboard}>
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t.admin.orders.table.actions.clickToCopy}
                </div>
              </div>
            </div>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "userEmail",
      header: ({ column }) => (
        <SortableHeader column={column} title={t.admin.orders.table.columns.user} t={t} />
      ),
      cell: ({ row }) => {
        const email = row.getValue("userEmail") as string
        const name = row.original.userName
        return (
          <div className="max-w-[150px]">
            <div className="font-medium truncate text-foreground" title={name || t.common.notAvailable}>
              {name || t.common.notAvailable}
            </div>
            <div className="text-sm text-muted-foreground truncate" title={email || t.common.notAvailable}>
              {email || t.common.notAvailable}
            </div>
          </div>
        )
      },
      enableHiding: false,
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <SortableHeader column={column} title={t.admin.orders.table.columns.amount} t={t} />
      ),
      cell: ({ row }) => {
        const amount = row.getValue("amount") as string
        const currency = row.original.currency
        return <div className="font-medium text-foreground">{formatAmount(amount, currency)}</div>
      },
      enableHiding: false,
    },
    {
      accessorKey: "planId",
      header: t.admin.orders.table.columns.plan,
      cell: ({ row }) => {
        const planId = row.getValue("planId") as string
        return <div className="font-medium">{planId || t.common.notAvailable}</div>
      },
      enableSorting: false,
    },
    {
      accessorKey: "status",
      header: t.admin.orders.table.columns.status,
      cell: ({ row }) => getStatusBadge(row.getValue("status"), t),
      enableHiding: false,
      enableSorting: false,
    },
    {
      accessorKey: "provider",
      header: t.admin.orders.table.columns.provider,
      cell: ({ row }) => getProviderBadge(row.getValue("provider"), t),
      enableHiding: false,
      enableSorting: false,
    },
    {
      accessorKey: "providerOrderId",
      header: t.admin.orders.table.columns.providerOrderId,
      cell: ({ row }) => {
        const providerOrderId = row.getValue("providerOrderId") as string
        return (
          <div className="font-mono text-xs max-w-[120px] truncate" title={providerOrderId || t.common.notAvailable}>
            {providerOrderId || t.common.notAvailable}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <SortableHeader column={column} title={t.admin.orders.table.columns.createdAt} t={t} />
      ),
      cell: ({ row }) => {
        const date = row.getValue("createdAt") as string | Date | null
        return <div className="text-sm text-muted-foreground">{formatDate(date)}</div>
      },
    },
    {
      accessorKey: "updatedAt",
      header: t.admin.orders.table.columns.updatedAt,
      cell: ({ row }) => {
        const date = row.getValue("updatedAt") as string | Date | null
        return <div className="text-sm text-muted-foreground">{formatDate(date)}</div>
      },
      enableSorting: false,
    },
  ]
}
