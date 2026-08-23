import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import { Badge } from '@libs/react-shared/ui/badge'
import { Input } from '@libs/react-shared/ui/input'
import { Button } from '@libs/react-shared/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@libs/react-shared/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@libs/react-shared/ui/table'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@libs/react-shared/ui/pagination'
import { Search, X, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/$lang/admin/withdrawals/')({
  component: AdminWithdrawalsPage,
})

type SearchField = 'userEmail' | 'userName' | 'paymentAccount'

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
  createdAt: string
  userName?: string
  userEmail?: string
}

function AdminWithdrawalsPage() {
  const { t } = useTranslation()
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchValue, setSearchValue] = useState('')
  const [searchField, setSearchField] = useState<SearchField>('userEmail')
  const [status, setStatus] = useState('all')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const pageSize = 10

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      })
      if (searchValue) {
        params.set('searchField', searchField)
        params.set('searchValue', searchValue)
      }
      if (status && status !== 'all') params.set('status', status)

      const res = await fetch(`/api/admin/withdrawals?${params}`)
      const data = await res.json()
      setWithdrawals(data.withdrawals || [])
      setTotal(data.total || 0)
    } catch {
      console.error('Failed to fetch withdrawals')
    } finally {
      setLoading(false)
    }
  }, [page, searchValue, searchField, status])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / pageSize)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchData()
  }

  const handleClear = () => {
    setSearchValue('')
    setSearchField('userEmail')
    setStatus('all')
    setPage(1)
  }

  const handleFieldChange = (value: string) => {
    setSearchField(value as SearchField)
    setSearchValue('')
  }

  const handleStatusChange = (value: string) => {
    setStatus(value)
    setPage(1)
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage)
    }
  }

  const handleProcess = async (id: string, newStatus: 'completed' | 'rejected') => {
    setProcessingId(id)
    try {
      const note = newStatus === 'rejected' ? prompt(t.admin.withdrawals.dialog.notePlaceholder) : undefined
      const res = await fetch(`/api/admin/withdrawals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, adminNote: note || undefined }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to process withdrawal')
        return
      }
      toast.success(newStatus === 'completed' ? t.admin.withdrawals.actions.approve : t.admin.withdrawals.actions.reject)
      await fetchData()
    } catch {
      toast.error('Failed to process withdrawal')
    } finally {
      setProcessingId(null)
    }
  }

  const searchFieldLabels: Record<SearchField, string> = {
    userEmail: t.admin.withdrawals.table.columns.userEmail,
    userName: t.admin.withdrawals.table.columns.userName,
    paymentAccount: t.admin.withdrawals.table.columns.paymentAccount,
  }

  const statusBadge = (s: string) => {
    const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      pending: 'secondary',
      processing: 'outline',
      rejected: 'destructive',
    }
    return (
      <Badge variant={variantMap[s] || 'secondary'}>
        {t.admin.withdrawals.filter[s as keyof typeof t.admin.withdrawals.filter] || s}
      </Badge>
    )
  }

  return (
    <div className="container mx-auto py-10 px-5">
      <h1 className="text-2xl font-bold mb-6">{t.admin.withdrawals.title}</h1>

      <div className="space-y-4">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-wrap">
          <Select value={searchField} onValueChange={handleFieldChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t.admin.withdrawals.table.search.searchBy} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="userEmail">{searchFieldLabels.userEmail}</SelectItem>
              <SelectItem value="userName">{searchFieldLabels.userName}</SelectItem>
              <SelectItem value="paymentAccount">{searchFieldLabels.paymentAccount}</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder={t.admin.withdrawals.table.search.searchPlaceholder.replace('{field}', searchFieldLabels[searchField])}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-[250px]"
          />
          <Button type="submit" size="icon" className="shrink-0">
            <Search className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={handleClear}>
            <X className="h-4 w-4" />
          </Button>

          <div className="mx-2 h-4 w-px bg-border hidden sm:block" />

          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={t.admin.withdrawals.filter.filterByStatus} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.admin.withdrawals.filter.allStatus}</SelectItem>
              <SelectItem value="pending">{t.admin.withdrawals.filter.pending}</SelectItem>
              <SelectItem value="processing">{t.admin.withdrawals.filter.processing}</SelectItem>
              <SelectItem value="completed">{t.admin.withdrawals.filter.completed}</SelectItem>
              <SelectItem value="rejected">{t.admin.withdrawals.filter.rejected}</SelectItem>
            </SelectContent>
          </Select>
        </form>

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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : withdrawals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {t.admin.withdrawals.noResults}
                  </TableCell>
                </TableRow>
              ) : (
                withdrawals.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm">{w.userName || '—'}</div>
                        <div className="text-xs text-muted-foreground">{w.userEmail || '—'}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {parseFloat(w.amount).toFixed(2)} {w.currency.toUpperCase()}
                    </TableCell>
                    <TableCell className="text-sm">{w.paymentMethod}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate" title={w.paymentAccount}>
                      {w.paymentAccount}
                    </TableCell>
                    <TableCell>{statusBadge(w.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(w.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {w.status === 'pending' && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={processingId === w.id}
                            onClick={() => handleProcess(w.id, 'completed')}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t.admin.withdrawals.actions.approve}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            disabled={processingId === w.id}
                            onClick={() => handleProcess(w.id, 'rejected')}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            {t.admin.withdrawals.actions.reject}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => handlePageChange(page - 1)}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  label={t.actions.previous}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }).map((_, index) => {
                const p = index + 1
                if (p === 1 || p === totalPages || (p >= page - 2 && p <= page + 2)) {
                  return (
                    <PaginationItem key={p}>
                      <PaginationLink isActive={p === page} onClick={() => handlePageChange(p)} className="cursor-pointer">
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                }
                if (p === page - 3 || p === page + 3) {
                  return (
                    <PaginationItem key={p}>
                      <span className="flex h-9 w-9 items-center justify-center">...</span>
                    </PaginationItem>
                  )
                }
                return null
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => handlePageChange(page + 1)}
                  className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  label={t.actions.next}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  )
}
