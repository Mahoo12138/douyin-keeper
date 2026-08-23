import { useEffect, useState } from 'react'
import { Button } from '@libs/react-shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@libs/react-shared/ui/card'
import { Badge } from '@libs/react-shared/ui/badge'
import { Coins, TrendingUp, TrendingDown, History, ArrowRight, Loader2, Gift, RotateCcw } from 'lucide-react'
import { useTranslation } from '@/hooks/use-translation'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@libs/react-shared/ui/pagination'

interface CreditStatus {
  credits: { balance: number; totalPurchased: number; totalConsumed: number }
  hasSubscription: boolean
  canAccess: boolean
}

interface CreditTransaction {
  id: string
  type: string
  amount: string
  balance: string
  description: string | null
  createdAt: string
}

const PAGE_SIZE = 10

export function CreditsCard() {
  const { t, locale: currentLocale } = useTranslation()
  const [creditData, setCreditData] = useState<CreditStatus | null>(null)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchTransactions = async (page: number) => {
    setLoadingTransactions(true)
    try {
      const response = await fetch(`/api/credits/transactions?page=${page}&limit=${PAGE_SIZE}`)
      if (response.ok) {
        const data = await response.json()
        setTransactions(data.transactions || [])
        setTotalPages(data.totalPages || 1)
        setCurrentPage(data.page || 1)
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
    } finally {
      setLoadingTransactions(false)
    }
  }

  useEffect(() => {
    async function fetchCreditData() {
      try {
        const statusResponse = await fetch('/api/credits/status')
        if (statusResponse.ok) setCreditData(await statusResponse.json())
        await fetchTransactions(1)
      } catch (error) {
        console.error('Failed to fetch credit data', error)
      } finally {
        setLoading(false)
      }
    }
    fetchCreditData()
  }, [])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const getTransactionTypeDisplay = (type: string) => {
    const types = t.dashboard.credits.types as Record<string, string>
    const typeMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof TrendingUp }> = {
      purchase: { label: types.purchase || 'Purchase', variant: 'default', icon: TrendingUp },
      bonus: { label: types.bonus || 'Bonus', variant: 'secondary', icon: Gift },
      consumption: { label: types.consumption || 'Used', variant: 'outline', icon: TrendingDown },
      refund: { label: types.refund || 'Refund', variant: 'secondary', icon: RotateCcw },
      adjustment: { label: types.adjustment || 'Adjustment', variant: 'secondary', icon: History },
    }
    return typeMap[type] || { label: type, variant: 'outline' as const, icon: History }
  }

  const getDescriptionDisplay = (description: string | null) => {
    if (!description) return '-'
    const descriptions = t.dashboard.credits.descriptions as Record<string, string> | undefined
    if (descriptions && descriptions[description]) return descriptions[description]
    return description
  }

  const handlePageChange = async (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) await fetchTransactions(page)
  }

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Coins className="text-primary h-5 w-5" />{t.dashboard.credits.title}</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center py-8"><Loader2 className="text-muted-foreground h-6 w-6 animate-spin" /></CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Coins className="text-primary h-5 w-5" />{t.dashboard.credits.title}</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="mb-1 flex items-center justify-center gap-2"><Coins className="text-primary h-4 w-4" /><span className="text-muted-foreground text-sm font-medium">{t.dashboard.credits.available}</span></div>
            <p className="text-foreground text-2xl font-bold">{creditData?.credits.balance.toLocaleString() || 0}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="mb-1 flex items-center justify-center gap-2"><TrendingUp className="text-muted-foreground h-4 w-4" /><span className="text-muted-foreground text-sm font-medium">{t.dashboard.credits.totalPurchased}</span></div>
            <p className="text-foreground text-2xl font-bold">{creditData?.credits.totalPurchased.toLocaleString() || 0}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="mb-1 flex items-center justify-center gap-2"><TrendingDown className="text-muted-foreground h-4 w-4" /><span className="text-muted-foreground text-sm font-medium">{t.dashboard.credits.totalConsumed}</span></div>
            <p className="text-foreground text-2xl font-bold">{creditData?.credits.totalConsumed.toLocaleString() || 0}</p>
          </div>
        </div>

        {transactions.length > 0 && (
          <div>
            <h4 className="text-muted-foreground mb-3 flex items-center gap-2 text-sm font-medium"><History className="h-4 w-4" />{t.dashboard.credits.recentTransactions}</h4>
            <div className="rounded-md border">
              <table className="w-full table-fixed">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-muted-foreground w-[90px] px-3 py-2 text-left text-xs font-medium uppercase">{t.dashboard.credits.table?.type || 'Type'}</th>
                    <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium uppercase">{t.dashboard.credits.table?.description || 'Description'}</th>
                    <th className="text-muted-foreground w-[80px] px-3 py-2 text-right text-xs font-medium uppercase">{t.dashboard.credits.table?.amount || 'Amount'}</th>
                    <th className="text-muted-foreground w-[120px] px-3 py-2 text-right text-xs font-medium uppercase">{t.dashboard.credits.table?.time || 'Time'}</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {transactions.map((tx) => {
                    const typeInfo = getTransactionTypeDisplay(tx.type)
                    const TypeIcon = typeInfo.icon
                    const amount = parseFloat(tx.amount)
                    return (
                      <tr key={tx.id} className={`hover:bg-muted/50 ${loadingTransactions ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-3"><Badge variant={typeInfo.variant} className="text-xs"><TypeIcon className="mr-1 h-3 w-3" />{typeInfo.label}</Badge></td>
                        <td className="text-foreground truncate px-3 py-3 text-sm">{getDescriptionDisplay(tx.description)}</td>
                        <td className={`px-3 py-3 text-right text-sm font-medium ${amount >= 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{amount >= 0 ? '+' : ''}{amount.toLocaleString()}</td>
                        <td className="text-muted-foreground whitespace-nowrap px-3 py-3 text-right text-sm">{formatDate(tx.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious onClick={() => handlePageChange(currentPage - 1)} className={currentPage <= 1 || loadingTransactions ? 'pointer-events-none opacity-50' : 'cursor-pointer'} label={t.actions.previous} />
                    </PaginationItem>
                    {Array.from({ length: totalPages }).map((_, index) => {
                      const page = index + 1
                      if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                        return (<PaginationItem key={page}><PaginationLink isActive={page === currentPage} onClick={() => handlePageChange(page)} className={loadingTransactions ? 'pointer-events-none opacity-50' : 'cursor-pointer'}>{page}</PaginationLink></PaginationItem>)
                      }
                      if (page === currentPage - 2 || page === currentPage + 2) return (<PaginationItem key={page}><span className="flex h-9 w-9 items-center justify-center">...</span></PaginationItem>)
                      return null
                    })}
                    <PaginationItem>
                      <PaginationNext onClick={() => handlePageChange(currentPage + 1)} className={currentPage >= totalPages || loadingTransactions ? 'pointer-events-none opacity-50' : 'cursor-pointer'} label={t.actions.next} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        )}

        <Button asChild className="w-full">
          <a href={`/${currentLocale}/pricing`}>
            <Coins className="mr-2 h-4 w-4" />{t.dashboard.credits.buyMore}<ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}
