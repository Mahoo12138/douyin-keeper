import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import { DataTable } from './-data-table'

export const Route = createFileRoute('/$lang/admin/credits/')({
  component: CreditsPage,
})

interface CreditsData {
  transactions: any[]
  total: number
}

function CreditsPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<CreditsData>({ transactions: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchCredits() {
      try {
        const urlParams = new URLSearchParams(window.location.search)
        const page = Number(urlParams.get('page')) || 1
        const pageSize = 10
        const searchField = urlParams.get('searchField') || ''
        const searchValue = urlParams.get('searchValue') || ''
        const type = urlParams.get('type') || ''
        const sortBy = urlParams.get('sortBy') || ''
        const sortDirection = urlParams.get('sortDirection') || ''

        const queryParams = new URLSearchParams({
          page: page.toString(),
          limit: pageSize.toString(),
        })

        if (searchValue && searchField) {
          queryParams.append('searchField', searchField)
          queryParams.append('searchValue', searchValue)
        }
        if (type && type !== 'all') {
          queryParams.append('type', type)
        }
        if (sortBy && sortDirection) {
          queryParams.append('sortBy', sortBy)
          queryParams.append('sortDirection', sortDirection)
        }

        const response = await fetch(`/api/admin/credits/transactions?${queryParams.toString()}`)
        if (!response.ok) throw new Error('Failed to fetch credit transactions')

        const result = await response.json()
        setData({ transactions: result.transactions || [], total: result.total || 0 })
      } catch (err) {
        console.error('Failed to fetch credit transactions', err)
        setError(t.admin.credits.messages.fetchError)
      } finally {
        setLoading(false)
      }
    }

    fetchCredits()
  }, [t])

  const urlParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  )
  const page = Number(urlParams.get('page')) || 1
  const pageSize = 10
  const totalPages = Math.ceil(data.total / pageSize)

  if (loading) {
    return (
      <div className="container mx-auto py-10 px-5">
        <div>
          <h1 className="text-2xl font-bold">{t.admin.credits.title}</h1>
          <p className="text-muted-foreground">{t.admin.credits.subtitle}</p>
        </div>
        <div className="flex items-center justify-center py-10">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-10 px-5">
        <div>
          <h1 className="text-2xl font-bold">{t.admin.credits.title}</h1>
          <p className="text-muted-foreground">{t.admin.credits.subtitle}</p>
        </div>
        <div className="text-center py-10">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 px-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{t.admin.credits.title}</h1>
          <p className="text-muted-foreground">{t.admin.credits.subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <DataTable
          data={data.transactions}
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
