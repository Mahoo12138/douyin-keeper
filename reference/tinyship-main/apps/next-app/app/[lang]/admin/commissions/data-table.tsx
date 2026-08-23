"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/react-shared/ui/table"
import { Badge } from "@libs/react-shared/ui/badge"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@libs/react-shared/ui/pagination"
import { useRouter, usePathname } from "next/navigation"
import { useTranslation } from "@/hooks/use-translation"
import { Search } from "./components/search"

interface Commission {
  id: string
  referrerId: string
  orderId: string
  buyerId: string
  orderAmount: string
  currency: string
  commissionRate: string
  commissionAmount: string
  status: string
  createdAt: string
  referrerEmail: string | null
  referrerName: string | null
}

interface CommissionsDataTableProps {
  data: Commission[]
  pagination?: {
    currentPage: number
    totalPages: number
    pageSize: number
    total: number
  }
}

const statusVariant = (status: string) => {
  switch (status) {
    case 'credited': return 'default'
    case 'pending': return 'secondary'
    case 'withdrawn': return 'outline'
    case 'cancelled': return 'destructive'
    default: return 'secondary'
  }
}

const formatDate = (date: string | null) => {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function CommissionsDataTable({ data, pagination }: CommissionsDataTableProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()

  const handlePageChange = (page: number) => {
    const searchParams = new URLSearchParams(window.location.search)
    searchParams.set("page", page.toString())
    router.push(`${pathname}?${searchParams.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Search />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.admin.commissions.table.columns.referrer}</TableHead>
              <TableHead>{t.admin.commissions.table.columns.orderId}</TableHead>
              <TableHead>{t.admin.commissions.table.columns.orderAmount}</TableHead>
              <TableHead>{t.admin.commissions.table.columns.rate}</TableHead>
              <TableHead>{t.admin.commissions.table.columns.commission}</TableHead>
              <TableHead>{t.admin.commissions.table.columns.status}</TableHead>
              <TableHead>{t.admin.commissions.table.columns.date}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length ? (
              data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium text-sm">{item.referrerName || '—'}</div>
                      <div className="text-xs text-muted-foreground">{item.referrerEmail || '—'}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.orderId ? `#${item.orderId.slice(-8)}` : '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {parseFloat(item.orderAmount).toFixed(2)} {item.currency.toUpperCase()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(parseFloat(item.commissionRate) * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {parseFloat(item.commissionAmount).toFixed(2)} {item.currency.toUpperCase()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.status)}>
                      {t.admin.commissions.filter[item.status as keyof typeof t.admin.commissions.filter] || item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  {t.admin.commissions.noResults}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.totalPages > 1 && (
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
