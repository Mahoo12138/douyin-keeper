import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import { Button } from '@libs/react-shared/ui/button'
import { UserPlus } from 'lucide-react'
import { DataTable } from './-data-table'

export const Route = createFileRoute('/$lang/admin/users/')({
  component: UsersPage,
})

function UsersPage() {
  const { t, locale } = useTranslation()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 10

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true)
      const sp = new URLSearchParams(window.location.search)
      const currentPage = Number(sp.get('page')) || 1
      setPage(currentPage)

      const queryParams = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((currentPage - 1) * pageSize).toString(),
      })

      const searchField = sp.get('searchField')
      const searchValue = sp.get('searchValue')
      if (searchValue && searchField) {
        queryParams.set('searchField', searchField)
        queryParams.set('searchValue', searchValue)
      }

      const role = sp.get('role')
      if (role && role !== 'all') queryParams.set('role', role)

      const banned = sp.get('banned')
      if (banned && banned !== 'all') queryParams.set('banned', banned)

      const sortBy = sp.get('sortBy')
      const sortDirection = sp.get('sortDirection')
      if (sortBy && sortDirection) {
        queryParams.set('sortBy', sortBy)
        queryParams.set('sortDirection', sortDirection)
      }

      try {
        const response = await fetch(`/api/admin/users?${queryParams.toString()}`)
        if (!response.ok) throw new Error('Failed to fetch users')
        const result = await response.json()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error')
      } finally {
        setLoading(false)
      }
    }
    fetchUsers()
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto py-10 px-5">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-48 mb-4" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-10 px-5">
        <h1 className="text-2xl font-bold mb-4">{t.admin.users.title}</h1>
        <p className="text-red-500">{t.admin.users.messages.fetchError}</p>
      </div>
    )
  }

  const totalPages = Math.ceil((data?.total || 0) / pageSize)

  return (
    <div className="container mx-auto py-10 px-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{t.admin.users.title}</h1>
        <a href={`/${locale}/admin/users/new`}>
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            {t.admin.users.actions.addUser}
          </Button>
        </a>
      </div>
      <div className="flex flex-col gap-4">
        <DataTable
          data={data?.users || []}
          pagination={{
            currentPage: page,
            totalPages,
            pageSize,
            total: data?.total || 0,
          }}
        />
      </div>
    </div>
  )
}
