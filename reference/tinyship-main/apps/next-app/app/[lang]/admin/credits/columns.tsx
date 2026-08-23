"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@libs/react-shared/ui/badge"
import { Button } from "@libs/react-shared/ui/button"
import { ArrowUpDown, Copy, ArrowUp, ArrowDown, TrendingUp, TrendingDown, Gift, RotateCcw, Settings2, Bot, Cpu } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@libs/react-shared/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@libs/react-shared/ui/tooltip"
import { useTranslation } from "@/hooks/use-translation"
import type { CreditTransaction } from '@libs/database/schema/credit-transaction'

export type CreditTransactionRow = CreditTransaction & {
  userEmail?: string | null
  userName?: string | null
}

const getTypeBadge = (type: string, t: any) => {
  const typeConfig = {
    purchase: { label: t.admin.credits.type.purchase, variant: "default" as const, icon: TrendingUp },
    consumption: { label: t.admin.credits.type.consumption, variant: "secondary" as const, icon: TrendingDown },
    refund: { label: t.admin.credits.type.refund, variant: "secondary" as const, icon: RotateCcw },
    bonus: { label: t.admin.credits.type.bonus, variant: "outline" as const, icon: Gift },
    adjustment: { label: t.admin.credits.type.adjustment, variant: "outline" as const, icon: Settings2 },
  }
  
  const config = typeConfig[type as keyof typeof typeConfig] || { label: type, variant: "outline" as const, icon: Settings2 }
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
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

const formatAmount = (amount: string) => {
  const numAmount = parseFloat(amount)
  if (isNaN(numAmount)) return amount
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numAmount)
}

// Sortable header component
const SortableHeader = ({ column, title, t }: { column: any, title: string, t: any }) => {
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
          {t.admin.credits.table.sort.ascending}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          <ArrowDown className="mr-2 h-4 w-4" />
          {t.admin.credits.table.sort.descending}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => column.clearSorting()}>
          <ArrowUpDown className="mr-2 h-4 w-4" />
          {t.admin.credits.table.sort.none}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const useCreditColumns = (): ColumnDef<CreditTransactionRow>[] => {
  const { t } = useTranslation()

  return [
    {
      accessorKey: "id",
      header: t.admin.credits.table.columns.id,
      cell: ({ row }) => {
        const id = row.getValue("id") as string
        
        const copyToClipboard = async () => {
          try {
            await navigator.clipboard.writeText(id)
            console.log('Transaction ID copied to clipboard:', id)
          } catch (err) {
            console.error('Failed to copy Transaction ID:', err)
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
            
            {/* Tooltip */}
            <div className="absolute z-50 hidden group-hover:block top-full left-0 pt-1">
              <div className="bg-popover text-popover-foreground shadow-md rounded-md border p-2 text-xs font-mono min-w-max">
                <div className="flex items-center gap-2">
                  <span className="select-all">{id}</span>
                  <button 
                    className="p-1 hover:bg-accent rounded"
                    onClick={copyToClipboard}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t.admin.credits.table.actions.clickToCopy}
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
      header: ({ column }) => {
        return <SortableHeader column={column} title={t.admin.credits.table.columns.user} t={t} />
      },
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
      accessorKey: "type",
      header: t.admin.credits.table.columns.type,
      cell: ({ row }) => getTypeBadge(row.getValue("type"), t),
      enableHiding: false,
      enableSorting: false,
    },
    {
      accessorKey: "amount",
      header: ({ column }) => {
        return <SortableHeader column={column} title={t.admin.credits.table.columns.amount} t={t} />
      },
      cell: ({ row }) => {
        const amount = row.getValue("amount") as string
        const numAmount = parseFloat(amount)
        const isPositive = numAmount >= 0
        return (
          <div className="flex items-center gap-1 font-medium">
            {isPositive ? (
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span>{isPositive ? '+' : ''}{formatAmount(amount)}</span>
          </div>
        )
      },
      enableHiding: false,
    },
    {
      accessorKey: "balance",
      header: t.admin.credits.table.columns.balance,
      cell: ({ row }) => {
        const balance = row.getValue("balance") as string
        return <div className="font-medium text-foreground">{formatAmount(balance)}</div>
      },
      enableSorting: false,
    },
    {
      accessorKey: "description",
      header: t.admin.credits.table.columns.description,
      cell: ({ row }) => {
        const description = row.getValue("description") as string
        const metadata = row.original.metadata as Record<string, any> | null
        
        // Get translated description for type codes
        const descriptions = t.dashboard?.credits?.descriptions as Record<string, string> | undefined
        const displayDescription = descriptions?.[description] || description
        
        // Format metadata for AI usage details
        const hasMetadata = metadata && (metadata.model || metadata.provider || metadata.totalTokens)
        
        return (
          <div className="max-w-[250px]">
            <div className="text-sm truncate" title={displayDescription || t.common.notAvailable}>
              {displayDescription || t.common.notAvailable}
            </div>
            {hasMetadata && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      {metadata.provider && (
                        <span className="flex items-center gap-0.5">
                          <Bot className="h-3 w-3" />
                          {metadata.provider}
                        </span>
                      )}
                      {metadata.model && (
                        <span className="flex items-center gap-0.5">
                          <Cpu className="h-3 w-3" />
                          {metadata.model}
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <div className="space-y-1">
                      {metadata.provider && <div>Provider: {metadata.provider}</div>}
                      {metadata.model && <div>Model: {metadata.model}</div>}
                      {metadata.inputTokens && <div>Input tokens: {metadata.inputTokens}</div>}
                      {metadata.outputTokens && <div>Output tokens: {metadata.outputTokens}</div>}
                      {metadata.totalTokens && <div>Total tokens: {metadata.totalTokens}</div>}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => {
        return <SortableHeader column={column} title={t.admin.credits.table.columns.createdAt} t={t} />
      },
      cell: ({ row }) => {
        const date = row.getValue("createdAt") as string | Date | null
        return <div className="text-sm text-muted-foreground">{formatDate(date)}</div>
      },
    },
  ]
}

// For backward compatibility
export const columns: ColumnDef<CreditTransactionRow>[] = []

