"use client"

import { Table } from "@tanstack/react-table"
import { Button } from "@libs/react-shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@libs/react-shared/ui/dropdown-menu"
import { Settings2, Check } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"

interface ColumnToggleProps<TData> {
  table: Table<TData>
}

export function ColumnToggle<TData>({
  table,
}: ColumnToggleProps<TData>) {
  const { t } = useTranslation()
  
  // Define which columns should be toggleable (hidden by default)
  const hiddenColumnIds = [
    "id",
    "planId", 
    "providerOrderId",
    "createdAt",
    "updatedAt",
  ]

  // Get columns that can be toggled
  const hiddenColumns = table
    .getAllColumns()
    .filter(
      (column) =>
        typeof column.accessorFn !== "undefined" && 
        hiddenColumnIds.includes(column.id)
    )

  // Column display name mapping
  const getColumnDisplayName = (columnId: string) => {
    const columnNames: Record<string, string> = {
      id: t.admin.orders.table.columns.id,
      user: t.admin.orders.table.columns.user,
      amount: t.admin.orders.table.columns.amount,
      planId: t.admin.orders.table.columns.plan,
      status: t.admin.orders.table.columns.status,
      provider: t.admin.orders.table.columns.provider,
      providerOrderId: t.admin.orders.table.columns.providerOrderId,
      createdAt: t.admin.orders.table.columns.createdAt,
      updatedAt: t.admin.orders.table.columns.updatedAt,
      actions: t.admin.orders.table.columns.actions
    }
    
    return columnNames[columnId] || columnId
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto h-8">
          <Settings2 className="mr-2 h-4 w-4" />
          {t.admin.users.table.search.view}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel>{t.admin.users.table.search.toggleColumns}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hiddenColumns.map((column) => {
          return (
            <DropdownMenuItem
              key={column.id}
              className="flex items-center justify-between"
              onSelect={(e) => {
                e.preventDefault()
                column.toggleVisibility()
              }}
            >
              <span className="capitalize">
                {getColumnDisplayName(column.id)}
              </span>
              {column.getIsVisible() && (
                <Check className="h-4 w-4" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 