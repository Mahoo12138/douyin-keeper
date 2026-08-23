import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  SortingState,
  useReactTable,
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
import { useState, useEffect } from "react"
import { Search } from "./components/-search"
import { useTranslation } from "@/hooks/use-translation"
import { useBlogColumns } from "./-columns"

interface DataTableProps<TData, TValue> {
  columns?: ColumnDef<TData, TValue>[]
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
  const columns = useBlogColumns()
  const [sorting, setSorting] = useState<SortingState>([])

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const sortBy = urlParams.get("sortBy")
    const sortDirection = urlParams.get("sortDirection")

    if (sortBy && sortDirection) {
      setSorting([{ id: sortBy, desc: sortDirection === "desc" }])
    }
  }, [])

  const table = useReactTable({
    data,
    columns: columns as ColumnDef<TData, TValue>[],
    onSortingChange: (updater) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater
      setSorting(newSorting)

      const params = new URLSearchParams(window.location.search)

      if (newSorting.length > 0) {
        params.set("sortBy", newSorting[0].id)
        params.set("sortDirection", newSorting[0].desc ? "desc" : "asc")
      } else {
        params.delete("sortBy")
        params.delete("sortDirection")
      }

      params.set("page", "1")
      window.location.href = `${window.location.pathname}?${params.toString()}`
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    state: {
      sorting,
    },
  })

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(window.location.search)
    params.set("page", page.toString())
    window.location.href = `${window.location.pathname}?${params.toString()}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Search />
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
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
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
                  {t.admin.blog.table.noResults}
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
              if (page === pagination.currentPage - 3 || page === pagination.currentPage + 3) {
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
                className={
                  pagination.currentPage >= pagination.totalPages
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer"
                }
                label={t.actions.next}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
