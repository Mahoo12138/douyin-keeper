import { headers } from 'next/headers'
import { translations } from '@libs/i18n'
import { config } from '@config'
import { CommissionsDataTable } from './data-table'

interface PageProps {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function AdminCommissionsPage({ params, searchParams }: PageProps) {
  const [{ lang }, rawParams] = await Promise.all([params, searchParams])
  const t = translations[lang as keyof typeof translations]

  const page = Number(rawParams.page) || 1
  const pageSize = 10
  const searchField = (rawParams.searchField as string) || 'referrerEmail'
  const searchValue = (rawParams.searchValue as string) || ''
  const status = (rawParams.status as string) || 'all'

  const queryParams = new URLSearchParams({
    limit: pageSize.toString(),
    offset: ((page - 1) * pageSize).toString(),
  })
  if (searchValue) {
    queryParams.append('searchField', searchField)
    queryParams.append('searchValue', searchValue)
  }
  if (status && status !== 'all') {
    queryParams.append('status', status)
  }

  try {
    const baseUrl = config.app.baseUrl
    const response = await fetch(`${baseUrl}/api/admin/commissions?${queryParams}`, {
      headers: await headers(),
      cache: 'no-store',
    })

    if (!response.ok) throw new Error('Failed to fetch commissions')

    const data = await response.json()
    const totalPages = Math.ceil((data?.total || 0) / pageSize)

    return (
      <div className="container mx-auto py-10 px-5">
        <h1 className="text-2xl font-bold mb-6">{t.admin.commissions.title}</h1>
        <CommissionsDataTable
          data={data?.commissions || []}
          pagination={{ currentPage: page, totalPages, pageSize, total: data?.total || 0 }}
        />
      </div>
    )
  } catch (error) {
    console.error('Error fetching commissions:', error)
    return (
      <div className="container mx-auto py-10 px-5">
        <h1 className="text-2xl font-bold mb-6">{t.admin.commissions.title}</h1>
        <div className="text-center py-10">
          <p className="text-destructive">Failed to load commission records.</p>
        </div>
      </div>
    )
  }
}
