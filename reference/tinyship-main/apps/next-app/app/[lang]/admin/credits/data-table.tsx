"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  VisibilityState,
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
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Search } from "./components/search"
import { ColumnToggle } from "./components/column-toggle"
import { useTranslation } from "@/hooks/use-translation"
import { useCreditColumns } from "./columns"

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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const columns = useCreditColumns()
  
  // Column visibility state management
  const COLUMN_VISIBILITY_KEY = 'admin-credits-column-visibility'
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    id: false,
    balance: false,
    // description is visible by default
  })
  const [sorting, setSorting] = useState<SortingState>([])
  
  // Load column visibility from localStorage after mount (avoid hydration mismatch)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(COLUMN_VISIBILITY_KEY)
      if (saved) {
        try {
          setColumnVisibility(JSON.parse(saved))
        } catch (e) {
          console.error('Failed to parse saved column visibility:', e)
        }
      }
    }
  }, [])
  
  // Persist column visibility to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(columnVisibility))
    }
  }, [columnVisibility])

  // Initialize sorting from URL parameters
  useEffect(() => {
    const sortBy = searchParams.get('sortBy')
    const sortDirection = searchParams.get('sortDirection')
    
    if (sortBy && sortDirection) {
      setSorting([{
        id: sortBy,
        desc: sortDirection === 'desc'
      }])
    }
  }, [searchParams])

  const table = useReactTable({
    data,
    columns: columns as ColumnDef<TData, TValue>[],
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater
      setSorting(newSorting)
      
      // Update URL with new sorting parameters
      const searchParams = new URLSearchParams(window.location.search)
      
      if (newSorting.length > 0) {
        searchParams.set('sortBy', newSorting[0].id)
        searchParams.set('sortDirection', newSorting[0].desc ? 'desc' : 'asc')
      } else {
        searchParams.delete('sortBy')
        searchParams.delete('sortDirection')
      }
      
      // Reset to first page when sorting changes
      searchParams.set('page', '1')
      router.push(`${pathname}?${searchParams.toString()}`)
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true, // Enable manual sorting for server-side
    state: {
      columnVisibility,
      sorting,
    },
  })

  const handlePageChange = (page: number) => {
    const searchParams = new URLSearchParams(window.location.search)
    searchParams.set("page", page.toString())
    router.push(`${pathname}?${searchParams.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Search />
        <ColumnToggle table={table} />
      </div>
      
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
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
                  {t.admin.credits.table.noResults}
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
              const page = index + 1;
              // Show first page, last page, and pages around current page
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
                );
              }
              // Show ellipsis for gaps
              if (
                page === pagination.currentPage - 3 ||
                page === pagination.currentPage + 3
              ) {
                return (
                  <PaginationItem key={page}>
                    <span className="flex h-9 w-9 items-center justify-center">...</span>
                  </PaginationItem>
                );
              }
              return null;
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

