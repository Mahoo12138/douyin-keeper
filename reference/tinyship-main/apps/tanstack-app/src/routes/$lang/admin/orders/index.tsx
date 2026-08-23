import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import { DataTable } from './-data-table'

export const Route = createFileRoute('/$lang/admin/orders/')({
  component: OrdersPage,
})

interface OrdersData {
  orders: any[]
  total: number
}

function OrdersPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<OrdersData>({ orders: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchOrders() {
      try {
        const urlParams = new URLSearchParams(window.location.search)
        const page = Number(urlParams.get('page')) || 1
        const pageSize = 10
        const searchField = urlParams.get('searchField') || ''
        const searchValue = urlParams.get('searchValue') || ''
        const status = urlParams.get('status') || ''
        const provider = urlParams.get('provider') || ''
        const sortBy = urlParams.get('sortBy') || ''
        const sortDirection = urlParams.get('sortDirection') || ''

        const queryParams = new URLSearchParams({
          limit: pageSize.toString(),
          offset: ((page - 1) * pageSize).toString(),
        })

        if (searchValue) {
          queryParams.append('searchField', searchField || 'id')
          queryParams.append('searchValue', searchValue)
        }
        if (status && status !== 'all') {
          queryParams.append('status', status)
        }
        if (provider && provider !== 'all') {
          queryParams.append('provider', provider)
        }
        if (sortBy && sortDirection) {
          queryParams.append('sortBy', sortBy)
          queryParams.append('sortDirection', sortDirection)
        }

        const response = await fetch(`/api/admin/orders?${queryParams.toString()}`)
        if (!response.ok) throw new Error('Failed to fetch orders')

        const result = await response.json()
        setData({ orders: result.orders || [], total: result.total || 0 })
      } catch (err) {
        console.error('Failed to fetch orders', err)
        setError('Failed to fetch orders')
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [])

  const urlParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  )
  const page = Number(urlParams.get('page')) || 1
  const pageSize = 10
  const totalPages = Math.ceil(data.total / pageSize)

  if (loading) {
    return (
      <div className="container mx-auto py-10 px-5">
        <h1 className="text-2xl font-bold mb-4">{t.admin.orders.title}</h1>
        <div className="flex items-center justify-center py-10">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-10 px-5">
        <h1 className="text-2xl font-bold mb-4">{t.admin.orders.title}</h1>
        <div className="text-center py-10">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 px-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{t.admin.orders.title}</h1>
      </div>
      <div className="flex flex-col gap-4">
        <DataTable
          data={data.orders}
          pagination={{
            currentPage: page,
            totalPages,
            pageSize,
            total: data.total,
          }}
        />
      </div>
    </div>
  )
}
