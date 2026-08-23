import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import { Button } from '@libs/react-shared/ui/button'
import { Plus } from 'lucide-react'
import { DataTable } from './-data-table'

export const Route = createFileRoute('/$lang/admin/blog/')({
  component: BlogPage,
})

interface BlogData {
  posts: any[]
  total: number
  totalPages?: number
}

function BlogPage() {
  const { t, locale } = useTranslation()
  const [data, setData] = useState<BlogData>({ posts: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPosts() {
      try {
        const urlParams = new URLSearchParams(window.location.search)
        const page = Number(urlParams.get('page')) || 1
        const pageSize = 10
        const search = urlParams.get('search') || ''
        const status = urlParams.get('status') || ''
        const sortBy = urlParams.get('sortBy') || ''
        const sortDirection = urlParams.get('sortDirection') || ''

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

        const response = await fetch(`/api/admin/blog?${queryParams.toString()}`)
        if (!response.ok) throw new Error('Failed to fetch blog posts')

        const result = await response.json()
        setData({
          posts: result.posts || [],
          total: result.total || 0,
          totalPages: result.totalPages,
        })
      } catch (err) {
        console.error('Failed to fetch blog posts', err)
        setError(t.admin.blog.messages.fetchError)
      } finally {
        setLoading(false)
      }
    }

    fetchPosts()
  }, [t])

  const urlParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  )
  const page = Number(urlParams.get('page')) || 1
  const pageSize = 10
  const totalPages = data.totalPages ?? Math.ceil(data.total / pageSize)

  if (loading) {
    return (
      <div className="container mx-auto py-10 px-5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{t.admin.blog.title}</h1>
          <a href={`/${locale}/admin/blog/new`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t.admin.blog.actions.newPost}
            </Button>
          </a>
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
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{t.admin.blog.title}</h1>
          <a href={`/${locale}/admin/blog/new`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t.admin.blog.actions.newPost}
            </Button>
          </a>
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
        <h1 className="text-2xl font-bold">{t.admin.blog.title}</h1>
        <a href={`/${locale}/admin/blog/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t.admin.blog.actions.newPost}
          </Button>
        </a>
      </div>
      <div className="flex flex-col gap-4">
        <DataTable
          data={data.posts}
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
