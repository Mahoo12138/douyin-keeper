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
import { SlidersHorizontal, Check } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"

interface ColumnToggleProps<TData> {
  table: Table<TData>
}

export function ColumnToggle<TData>({
  table,
}: ColumnToggleProps<TData>) {
  const { t } = useTranslation()
  
  // Define which columns should be toggleable (hidden by default)
  const toggleableColumnIds = [
    "id",
    "periodStart",
    "periodEnd",
    "cancelAtPeriodEnd",
    "createdAt",
  ]

  // Filter columns to only show toggleable ones
  const filteredColumns = table.getAllColumns().filter(
    (column) => 
      typeof column.accessorFn !== 'undefined' && 
      toggleableColumnIds.includes(column.id)
  )

  // Get display name for column
  const getColumnDisplayName = (columnId: string): string => {
    const columnMap: Record<string, string> = {
      id: t.admin.subscriptions.table.columns.id,
      planId: t.admin.subscriptions.table.columns.plan,
      paymentType: t.admin.subscriptions.table.columns.paymentType,
      periodStart: t.admin.subscriptions.table.columns.periodStart,
      periodEnd: t.admin.subscriptions.table.columns.periodEnd,
      cancelAtPeriodEnd: t.admin.subscriptions.table.columns.cancelAtPeriodEnd,
      createdAt: t.admin.subscriptions.table.columns.createdAt,
    }
    
    return columnMap[columnId] || columnId
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto hidden h-8 lg:flex">
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          {t.admin.subscriptions.table.view}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel>{t.admin.subscriptions.table.toggleColumns}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {filteredColumns.map((column) => {
          return (
            <DropdownMenuItem
              key={column.id}
              className="flex items-center justify-between"
              onSelect={(event) => { 
                event.preventDefault()
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