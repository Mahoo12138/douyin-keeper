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
import { Search, X, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/$lang/admin/commissions/')({
  component: AdminCommissionsPage,
})

type SearchField = 'referrerEmail' | 'referrerName' | 'orderId'

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
  referrerName?: string
  referrerEmail?: string
}

function AdminCommissionsPage() {
  const { t } = useTranslation()
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchValue, setSearchValue] = useState('')
  const [searchField, setSearchField] = useState<SearchField>('referrerEmail')
  const [status, setStatus] = useState('all')
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

      const res = await fetch(`/api/admin/commissions?${params}`)
      const data = await res.json()
      setCommissions(data.commissions || [])
      setTotal(data.total || 0)
    } catch {
      console.error('Failed to fetch commissions')
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
    setSearchField('referrerEmail')
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

  const searchFieldLabels: Record<SearchField, string> = {
    referrerEmail: t.admin.commissions.table.columns.referrerEmail,
    referrerName: t.admin.commissions.table.columns.referrerName,
    orderId: t.admin.commissions.table.columns.orderId,
  }

  const statusBadge = (s: string) => {
    const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      credited: 'default',
      pending: 'secondary',
      withdrawn: 'outline',
      cancelled: 'destructive',
    }
    return (
      <Badge variant={variantMap[s] || 'secondary'}>
        {t.admin.commissions.filter[s as keyof typeof t.admin.commissions.filter] || s}
      </Badge>
    )
  }

  return (
    <div className="container mx-auto py-10 px-5">
      <h1 className="text-2xl font-bold mb-6">{t.admin.commissions.title}</h1>

      <div className="space-y-4">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-wrap">
          <Select value={searchField} onValueChange={handleFieldChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t.admin.commissions.table.search.searchBy} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="referrerEmail">{searchFieldLabels.referrerEmail}</SelectItem>
              <SelectItem value="referrerName">{searchFieldLabels.referrerName}</SelectItem>
              <SelectItem value="orderId">{searchFieldLabels.orderId}</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder={t.admin.commissions.table.search.searchPlaceholder.replace('{field}', searchFieldLabels[searchField])}
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
              <SelectValue placeholder={t.admin.commissions.filter.filterByStatus} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.admin.commissions.filter.allStatus}</SelectItem>
              <SelectItem value="credited">{t.admin.commissions.filter.credited}</SelectItem>
              <SelectItem value="pending">{t.admin.commissions.filter.pending}</SelectItem>
              <SelectItem value="withdrawn">{t.admin.commissions.filter.withdrawn}</SelectItem>
              <SelectItem value="cancelled">{t.admin.commissions.filter.cancelled}</SelectItem>
            </SelectContent>
          </Select>
        </form>

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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : commissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {t.admin.commissions.noResults}
                  </TableCell>
                </TableRow>
              ) : (
                commissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm">{c.referrerName || '—'}</div>
                        <div className="text-xs text-muted-foreground">{c.referrerEmail || '—'}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {c.orderId ? `#${c.orderId.slice(-8)}` : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {parseFloat(c.orderAmount).toFixed(2)} {c.currency.toUpperCase()}
                    </TableCell>
                    <TableCell className="text-sm">{(parseFloat(c.commissionRate) * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-sm font-medium">
                      {parseFloat(c.commissionAmount).toFixed(2)} {c.currency.toUpperCase()}
                    </TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString()}
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
