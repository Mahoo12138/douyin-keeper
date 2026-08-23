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

export type Subscription = {
  id: string
  userId: string | null
  planId: string | null
  status: string
  paymentType: string
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  creemCustomerId?: string | null
  creemSubscriptionId?: string | null
  dodoCustomerId?: string | null
  dodoSubscriptionId?: string | null
  periodStart: string | Date | null
  periodEnd: string | Date | null
  cancelAtPeriodEnd?: boolean | null
  metadata?: any
  createdAt: string | Date | null
  updatedAt?: string | Date | null
  userName?: string | null
  userEmail?: string | null
}

const getStatusBadge = (status: string, t: any) => {
  const statusConfig = {
    active: { label: t.admin.subscriptions.table.search.active, variant: "default" as const },
    canceled: { label: t.admin.subscriptions.table.search.canceled, variant: "secondary" as const },
    expired: { label: t.admin.subscriptions.table.search.expired, variant: "destructive" as const },
    trialing: { label: t.admin.subscriptions.table.search.trialing, variant: "outline" as const },
    inactive: { label: t.admin.subscriptions.table.search.inactive, variant: "outline" as const },
  }

  const config = statusConfig[status as keyof typeof statusConfig] || { label: status, variant: "outline" as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

const getPaymentTypeBadge = (paymentType: string, t: any) => {
  const typeConfig = {
    one_time: { label: t.admin.subscriptions.table.search.oneTime, variant: "outline" as const },
    recurring: { label: t.admin.subscriptions.table.search.recurring, variant: "outline" as const },
  }

  const config = typeConfig[paymentType as keyof typeof typeConfig] || { label: paymentType, variant: "outline" as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

const formatDate = (date: string | Date | null) => {
  if (!date) return 'N/A'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const formatDateTime = (date: string | Date | null) => {
  if (!date) return 'N/A'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getProviderDisplay = (subscription: Subscription) => {
  if (subscription.stripeCustomerId || subscription.stripeSubscriptionId) {
    return 'Stripe'
  }
  if (subscription.creemCustomerId || subscription.creemSubscriptionId) {
    return 'Creem'
  }
  if (subscription.dodoCustomerId || subscription.dodoSubscriptionId) {
    return 'Dodo Payments'
  }
  return 'WeChat'
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
          {t.admin.subscriptions.table.sort.ascending}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          <ArrowDown className="mr-2 h-4 w-4" />
          {t.admin.subscriptions.table.sort.descending}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => column.clearSorting()}>
          <ArrowUpDown className="mr-2 h-4 w-4" />
          {t.admin.subscriptions.table.sort.none}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const useSubscriptionColumns = (): ColumnDef<Subscription>[] => {
  const { t } = useTranslation()

  return [
    {
      accessorKey: "id",
      header: t.admin.subscriptions.table.columns.id,
      cell: ({ row }) => {
        const id = row.getValue("id") as string

        const copyToClipboard = async () => {
          try {
            await navigator.clipboard.writeText(id)
          } catch (err) {
            console.error('Failed to copy Subscription ID:', err)
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
                  {t.admin.subscriptions.table.actions.clickToCopy}
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
      header: t.admin.subscriptions.table.columns.user,
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
      accessorKey: "planId",
      header: t.admin.subscriptions.table.columns.plan,
      cell: ({ row }) => {
        const planId = row.getValue("planId") as string
        return <div className="font-medium">{planId || t.common.notAvailable}</div>
      },
    },
    {
      accessorKey: "status",
      header: t.admin.subscriptions.table.columns.status,
      cell: ({ row }) => getStatusBadge(row.getValue("status"), t),
      enableHiding: false,
    },
    {
      accessorKey: "paymentType",
      header: t.admin.subscriptions.table.columns.paymentType,
      cell: ({ row }) => getPaymentTypeBadge(row.getValue("paymentType"), t),
    },
    {
      id: "provider",
      header: t.admin.subscriptions.table.columns.provider,
      cell: ({ row }) => {
        const provider = getProviderDisplay(row.original)
        return <div className="font-medium">{provider}</div>
      },
      enableHiding: false,
      enableSorting: false,
    },
    {
      accessorKey: "stripeSubscriptionId",
      header: "Stripe Sub ID",
      cell: ({ row }) => {
        const subId = row.getValue("stripeSubscriptionId") as string | null
        return (
          <div className="font-mono text-xs max-w-[120px] truncate" title={subId || 'N/A'}>
            {subId || 'N/A'}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "creemSubscriptionId",
      header: "Creem Sub ID",
      cell: ({ row }) => {
        const subId = row.getValue("creemSubscriptionId") as string | null
        return (
          <div className="font-mono text-xs max-w-[120px] truncate" title={subId || 'N/A'}>
            {subId || 'N/A'}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "dodoSubscriptionId",
      header: "Dodo Sub ID",
      cell: ({ row }) => {
        const subId = row.getValue("dodoSubscriptionId") as string | null
        return (
          <div className="font-mono text-xs max-w-[120px] truncate" title={subId || 'N/A'}>
            {subId || 'N/A'}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "periodStart",
      header: t.admin.subscriptions.table.columns.periodStart,
      cell: ({ row }) => {
        const startDate = row.getValue("periodStart") as string | Date | null
        return <div className="text-sm text-muted-foreground">{formatDate(startDate)}</div>
      },
    },
    {
      accessorKey: "periodEnd",
      header: t.admin.subscriptions.table.columns.periodEnd,
      cell: ({ row }) => {
        const endDate = row.getValue("periodEnd") as string | Date | null
        return <div className="text-sm text-muted-foreground">{formatDate(endDate)}</div>
      },
    },
    {
      accessorKey: "cancelAtPeriodEnd",
      header: t.admin.subscriptions.table.columns.cancelAtPeriodEnd,
      cell: ({ row }) => {
        const willCancel = row.getValue("cancelAtPeriodEnd") as boolean | null
        return (
          <Badge variant={willCancel ? "destructive" : "outline"}>
            {willCancel ? t.common.yes : t.common.no}
          </Badge>
        )
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <SortableHeader column={column} title={t.admin.subscriptions.table.columns.createdAt} t={t} />
      ),
      cell: ({ row }) => {
        const date = row.getValue("createdAt") as string | Date | null
        return <div className="text-sm text-muted-foreground">{formatDateTime(date)}</div>
      },
    },
  ]
}
