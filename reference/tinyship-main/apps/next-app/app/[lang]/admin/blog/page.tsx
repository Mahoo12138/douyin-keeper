import { headers } from 'next/headers'
import Link from 'next/link'
import { DataTable } from './data-table'
import { Button } from '@libs/react-shared/ui/button'
import { Plus } from 'lucide-react'
import { translations } from '@libs/i18n'
import { config } from '@config'

interface PageProps {
  params: Promise<{
    lang: string
  }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function BlogPage({ params, searchParams }: PageProps) {
  const [{ lang }, rawParams] = await Promise.all([params, searchParams])

  const t = translations[lang as keyof typeof translations]

  const page = Number(rawParams.page) || 1
  const pageSize = 10
  const search = (rawParams.search as string) || ''
  const status = (rawParams.status as string) || 'all'
  const sortBy = (rawParams.sortBy as string) || undefined
  const sortDirection = (rawParams.sortDirection as 'asc' | 'desc') || undefined

  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  })

  if (search && search.trim()) {
    queryParams.append('search', search.trim())
  }
  if (status && status !== 'all') {
    queryParams.append('status', status)
  }
  if (sortBy && sortDirection) {
    queryParams.append('sortBy', sortBy)
    queryParams.append('sortDirection', sortDirection)
  }

  try {
    const baseUrl = config.app.baseUrl
    const apiUrl = `${baseUrl}/api/admin/blog?${queryParams.toString()}`

    const response = await fetch(apiUrl, {
      headers: await headers(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error('Failed to fetch blog posts')
    }

    const data = await response.json()
    const totalPages = data?.totalPages ?? Math.ceil((data?.total || 0) / pageSize)

    return (
      <div className="container mx-auto py-10 px-5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{t.admin.blog.title}</h1>
          <Link href={`/${lang}/admin/blog/new`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t.admin.blog.actions.newPost}
            </Button>
          </Link>
        </div>
        <div className="flex flex-col gap-4">
          <DataTable
            data={data?.posts || []}
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
  } catch (error) {
    console.error('Error fetching blog posts:', error)
    return (
      <div className="container mx-auto py-10 px-5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{t.admin.blog.title}</h1>
          <Link href={`/${lang}/admin/blog/new`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t.admin.blog.actions.newPost}
            </Button>
          </Link>
        </div>
        <div className="flex flex-col gap-4">
          <div className="text-center py-10">
            <p className="text-red-500">{t.admin.blog.messages.fetchError}</p>
          </div>
        </div>
      </div>
    )
  }
}
