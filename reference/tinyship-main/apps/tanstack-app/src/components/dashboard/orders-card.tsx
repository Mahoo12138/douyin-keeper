import { useEffect, useState } from 'react'
import { Button } from '@libs/react-shared/ui/button'
import { Badge } from '@libs/react-shared/ui/badge'
import { ShoppingCart, Clock, CheckCircle, XCircle, AlertCircle, RotateCcw } from 'lucide-react'
import { useTranslation } from '@/hooks/use-translation'
import { config } from '@config'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@libs/react-shared/ui/pagination'

interface Order {
  id: string
  amount: string
  currency: string
  planId: string
  status: string
  provider: string
  providerOrderId?: string | null
  metadata?: any
  createdAt: string | Date
  updatedAt?: string | Date
}

const PAGE_SIZE = 10

export function OrdersCard() {
  const { t, locale: currentLocale } = useTranslation()
  const [ordersData, setOrdersData] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalOrders, setTotalOrders] = useState(0)

  const fetchOrders = async (page: number) => {
    setLoadingOrders(true)
    try {
      const response = await fetch(`/api/orders?page=${page}&limit=${PAGE_SIZE}`)
      if (response.ok) {
        const data = await response.json()
        setOrdersData(data.orders || [])
        setTotalPages(data.totalPages || 1)
        setTotalOrders(data.total || 0)
        setCurrentPage(data.page || 1)
      } else {
        setError('Failed to fetch orders')
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error)
      setError('Failed to fetch orders')
    } finally {
      setLoadingOrders(false)
    }
  }

  useEffect(() => {
    async function initFetch() {
      try { await fetchOrders(1) } finally { setLoading(false) }
    }
    initFetch()
  }, [])

  const handlePageChange = async (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) await fetchOrders(page)
  }

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString
    return date.toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const formatAmount = (amount: string, currency: string) => {
    const numAmount = parseFloat(amount)
    return `${currency === 'CNY' ? '¥' : '$'}${numAmount.toLocaleString()}`
  }

  const getPlanName = (planId: string) => {
    const plan = config.payment.plans[planId as keyof typeof config.payment.plans]
    return plan?.i18n[currentLocale]?.name || planId
  }

  const getOrderStatusDisplay = (status: string) => {
    switch (status) {
      case 'paid': return { text: t.dashboard.orders.status.paid, variant: 'default' as const, icon: CheckCircle }
      case 'pending': return { text: t.dashboard.orders.status.pending, variant: 'secondary' as const, icon: Clock }
      case 'failed': return { text: t.dashboard.orders.status.failed, variant: 'destructive' as const, icon: XCircle }
      case 'refunded': return { text: t.dashboard.orders.status.refunded, variant: 'outline' as const, icon: RotateCcw }
      case 'canceled': return { text: t.dashboard.orders.status.canceled, variant: 'secondary' as const, icon: XCircle }
      default: return { text: status, variant: 'outline' as const, icon: AlertCircle }
    }
  }

  const getProviderDisplay = (provider: string) => {
    switch (provider) {
      case 'stripe': return t.dashboard.orders.provider.stripe
      case 'wechat': return t.dashboard.orders.provider.wechat
      case 'creem': return t.dashboard.orders.provider.creem
      case 'alipay': return t.dashboard.orders.provider.alipay
      default: return provider
    }
  }

  if (loading) {
    return (
      <div>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold"><ShoppingCart className="h-5 w-5" />{t.dashboard.orders.title}</h3>
        <div className="animate-pulse"><div className="bg-muted mb-2 h-4 w-32 rounded" /><div className="bg-muted h-4 w-48 rounded" /></div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold"><ShoppingCart className="h-5 w-5" />{t.dashboard.orders.title}</h3>
        <div className="text-destructive text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="bg-card border-border rounded-lg border shadow-sm">
      <div className="border-border flex items-center justify-between border-b p-6">
        <h3 className="text-card-foreground flex items-center gap-2 text-lg font-semibold"><ShoppingCart className="h-5 w-5" />{t.dashboard.orders.title}</h3>
        <div className="text-muted-foreground text-sm">{t.dashboard.orders.page.totalOrders.replace('{count}', totalOrders.toString())}</div>
      </div>

      {ordersData.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-muted-foreground mb-4">{t.dashboard.orders.noOrdersDescription}</p>
          <Button variant="outline" asChild><a href={`/${currentLocale}/pricing`}>{t.dashboard.subscription.viewPlans}</a></Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-muted">
                <tr>
                  <th className="text-muted-foreground w-[100px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">{t.dashboard.orders.orderDetails.orderId}</th>
                  <th className="text-muted-foreground w-[140px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">{t.dashboard.orders.orderDetails.plan}</th>
                  <th className="text-muted-foreground w-[100px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">{t.dashboard.orders.orderDetails.amount}</th>
                  <th className="text-muted-foreground w-[100px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">{t.dashboard.orders.orderDetails.provider}</th>
                  <th className="text-muted-foreground w-[140px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">{t.dashboard.orders.orderDetails.status}</th>
                  <th className="text-muted-foreground w-[120px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">{t.dashboard.orders.orderDetails.createdAt}</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-border divide-y">
                {ordersData.map((orderItem) => {
                  const statusDisplay = getOrderStatusDisplay(orderItem.status)
                  return (
                    <tr key={orderItem.id} className={`hover:bg-muted/50 ${loadingOrders ? 'opacity-50' : ''}`}>
                      <td className="text-card-foreground px-3 py-4 text-sm font-medium"><div className="truncate">#{orderItem.id.slice(-8)}</div></td>
                      <td className="text-muted-foreground px-3 py-4 text-sm"><div className="truncate">{getPlanName(orderItem.planId)}</div></td>
                      <td className="text-card-foreground px-3 py-4 text-sm font-semibold"><div className="truncate">{formatAmount(orderItem.amount, orderItem.currency)}</div></td>
                      <td className="text-muted-foreground px-3 py-4 text-sm"><div className="truncate">{getProviderDisplay(orderItem.provider)}</div></td>
                      <td className="px-3 py-4"><Badge variant={statusDisplay.variant} className="text-xs"><statusDisplay.icon className="mr-1 h-3 w-3" /><span className="truncate">{statusDisplay.text}</span></Badge></td>
                      <td className="text-muted-foreground px-3 py-4 text-sm"><div className="truncate">{formatDate(orderItem.createdAt)}</div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="border-border border-t p-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => handlePageChange(currentPage - 1)} className={currentPage <= 1 || loadingOrders ? 'pointer-events-none opacity-50' : 'cursor-pointer'} label={t.actions.previous} />
                  </PaginationItem>
                  {Array.from({ length: totalPages }).map((_, index) => {
                    const page = index + 1
                    if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                      return (<PaginationItem key={page}><PaginationLink isActive={page === currentPage} onClick={() => handlePageChange(page)} className={loadingOrders ? 'pointer-events-none opacity-50' : 'cursor-pointer'}>{page}</PaginationLink></PaginationItem>)
                    }
                    if (page === currentPage - 2 || page === currentPage + 2) return (<PaginationItem key={page}><span className="flex h-9 w-9 items-center justify-center">...</span></PaginationItem>)
                    return null
                  })}
                  <PaginationItem>
                    <PaginationNext onClick={() => handlePageChange(currentPage + 1)} className={currentPage >= totalPages || loadingOrders ? 'pointer-events-none opacity-50' : 'cursor-pointer'} label={t.actions.next} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  )
}
