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
import { Button } from "@libs/react-shared/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@libs/react-shared/ui/pagination"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@libs/react-shared/ui/alert-dialog"
import { Input } from "@libs/react-shared/ui/input"
import { useRouter, usePathname } from "next/navigation"
import { useState } from "react"
import { Check, X } from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "@/hooks/use-translation"
import { Search } from "./components/search"

interface Withdrawal {
  id: string
  userId: string
  amount: string
  currency: string
  paymentMethod: string
  paymentAccount: string
  status: string
  adminNote: string | null
  processedAt: string | null
  processedBy: string | null
  createdAt: string
  userEmail: string | null
  userName: string | null
}

interface WithdrawalsDataTableProps {
  data: Withdrawal[]
  pagination?: {
    currentPage: number
    totalPages: number
    pageSize: number
    total: number
  }
}

const statusVariant = (status: string) => {
  switch (status) {
    case 'completed': return 'default'
    case 'pending': return 'secondary'
    case 'processing': return 'outline'
    case 'rejected': return 'destructive'
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

function WithdrawalActions({ item }: { item: Withdrawal }) {
  const { t } = useTranslation()
  const router = useRouter()
  const [adminNote, setAdminNote] = useState('')

  const handleAction = async (action: 'completed' | 'rejected') => {
    try {
      const res = await fetch(`/api/admin/withdrawals/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action, adminNote }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(action === 'completed' ? t.admin.withdrawals.actions.approve : t.admin.withdrawals.actions.reject)
      router.refresh()
    } catch {
      toast.error('Operation failed')
    }
  }

  if (item.status !== 'pending') return null

  return (
    <div className="flex items-center gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700">
            <Check className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.admin.withdrawals.dialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.admin.withdrawals.actions.approve} — {parseFloat(item.amount).toFixed(2)} {item.currency.toUpperCase()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder={t.admin.withdrawals.dialog.notePlaceholder}
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleAction('completed')}>
              {t.admin.withdrawals.dialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80">
            <X className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.admin.withdrawals.dialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.admin.withdrawals.actions.reject} — {parseFloat(item.amount).toFixed(2)} {item.currency.toUpperCase()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder={t.admin.withdrawals.dialog.notePlaceholder}
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAction('rejected')}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t.admin.withdrawals.dialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function WithdrawalsDataTable({ data, pagination }: WithdrawalsDataTableProps) {
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
              <TableHead>{t.admin.withdrawals.table.columns.user}</TableHead>
              <TableHead>{t.admin.withdrawals.table.columns.amount}</TableHead>
              <TableHead>{t.admin.withdrawals.table.columns.method}</TableHead>
              <TableHead>{t.admin.withdrawals.table.columns.paymentAccount}</TableHead>
              <TableHead>{t.admin.withdrawals.table.columns.status}</TableHead>
              <TableHead>{t.admin.withdrawals.table.columns.date}</TableHead>
              <TableHead>{t.admin.withdrawals.table.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length ? (
              data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium text-sm">{item.userName || '—'}</div>
                      <div className="text-xs text-muted-foreground">{item.userEmail || '—'}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {parseFloat(item.amount).toFixed(2)} {item.currency.toUpperCase()}
                  </TableCell>
                  <TableCell className="text-sm">{item.paymentMethod}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate" title={item.paymentAccount}>
                    {item.paymentAccount}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.status)}>
                      {t.admin.withdrawals.filter[item.status as keyof typeof t.admin.withdrawals.filter] || item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </TableCell>
                  <TableCell>
                    <WithdrawalActions item={item} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  {t.admin.withdrawals.noResults}
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
