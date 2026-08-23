import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
  type SortingState,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/react-shared/ui/table"

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@libs/react-shared/ui/pagination"
import { useState, useEffect, useMemo } from "react"
import { ColumnToggle } from "./components/-column-toggle"
import { Search } from "./components/-search"
import { useTranslation } from "@/hooks/use-translation"
import { columns as getColumns } from "./-columns"

interface DataTableProps<TData, TValue> {
  data: TData[]
  pagination?: {
    currentPage: number
    totalPages: number
    pageSize: number
    total: number
  }
}

export function DataTable<TData, TValue>({
  data,
  pagination,
}: DataTableProps<TData, TValue>) {
  const { t } = useTranslation()

  const columns = useMemo(() => getColumns(t) as ColumnDef<TData, TValue>[], [t])

  const COLUMN_VISIBILITY_KEY = 'admin-users-column-visibility-v2'
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    id: false,
    phoneNumber: false,
    emailVerified: false,
    referralCode: false,
    referredByCode: false,
    commissionBalance: false,
    createdAt: true,
    updatedAt: false,
  })
  const [sorting, setSorting] = useState<SortingState>([])

  useEffect(() => {
    const saved = localStorage.getItem(COLUMN_VISIBILITY_KEY)
    if (saved) {
      try {
        setColumnVisibility(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse saved column visibility:', e)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(columnVisibility))
  }, [columnVisibility])

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const sortBy = sp.get('sortBy')
    const sortDirection = sp.get('sortDirection')

    if (sortBy && sortDirection) {
      setSorting([{ id: sortBy, desc: sortDirection === 'desc' }])
    }
  }, [])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater
      setSorting(newSorting)

      const searchParams = new URLSearchParams(window.location.search)
      if (newSorting.length > 0) {
        searchParams.set("sortBy", newSorting[0].id)
        searchParams.set("sortDirection", newSorting[0].desc ? "desc" : "asc")
      } else {
        searchParams.delete("sortBy")
        searchParams.delete("sortDirection")
      }
      searchParams.set("page", "1")
      window.location.href = `${window.location.pathname}?${searchParams.toString()}`
    },
    state: {
      columnVisibility,
      sorting,
    },
    manualSorting: true,
    enableSorting: true,
  })

  const handlePageChange = (page: number) => {
    const searchParams = new URLSearchParams(window.location.search)
    searchParams.set("page", page.toString())
    window.location.href = `${window.location.pathname}?${searchParams.toString()}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Search />
        <ColumnToggle table={table} />
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t.admin.users.table.noResults}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                className={pagination.currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                label={t.actions.previous}
              />
            </PaginationItem>

            {Array.from({ length: pagination.totalPages }).map((_, index) => {
              const page = index + 1
              if (
                page === 1 ||
                page === pagination.totalPages ||
                (page >= pagination.currentPage - 2 && page <= pagination.currentPage + 2)
              ) {
                return (
                  <PaginationItem key={page}>
                    <PaginationLink
                      isActive={page === pagination.currentPage}
                      onClick={() => handlePageChange(page)}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                )
              }
              if (
                page === pagination.currentPage - 3 ||
                page === pagination.currentPage + 3
              ) {
                return (
                  <PaginationItem key={page}>
                    <span className="flex h-9 w-9 items-center justify-center">...</span>
                  </PaginationItem>
                )
              }
              return null
            })}

            <PaginationItem>
              <PaginationNext
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                className={pagination.currentPage >= pagination.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                label={t.actions.next}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
