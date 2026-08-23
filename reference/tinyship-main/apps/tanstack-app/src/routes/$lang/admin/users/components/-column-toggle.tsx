import { type Table } from "@tanstack/react-table"
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
  const hiddenColumns = [
    "id",
    "phoneNumber",
    "emailVerified",
    "referralCode",
    "referredByCode",
    "commissionBalance",
    "createdAt",
    "updatedAt",
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto h-8">
          <Settings2 className="mr-2 h-4 w-4" />
          {t.admin.users.table.search.view}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px]">
        <DropdownMenuLabel>{t.admin.users.table.search.toggleColumns}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" &&
              hiddenColumns.includes(column.id)
          )
          .map((column) => {
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
                  {t.admin.users.table.columns[column.id as keyof typeof t.admin.users.table.columns]}
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
