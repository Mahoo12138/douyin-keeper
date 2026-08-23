import { createFileRoute, Link } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { useState, useEffect } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import { Button } from '@libs/react-shared/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Skeleton } from '@libs/react-shared/ui/skeleton'

const PAGE_SIZE = 12

interface BlogData {
  posts: any[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const Route = createFileRoute('/$lang/(root)/blog/')({
  head: ({ params }) => seoHead(params.lang, (t) => t.blog.metadata),
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page) || 1,
  }),
  component: BlogListPage,
})

function BlogListPage() {
  const { lang } = Route.useParams()
  const { page: currentPage } = Route.useSearch()
  const { t } = useTranslation()
  const [data, setData] = useState<BlogData>({ posts: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchPosts() {
      setLoading(true)
      try {
        const response = await fetch(`/api/blog?page=${currentPage}&pageSize=${PAGE_SIZE}`)
        if (!response.ok) throw new Error('Failed to fetch')
        const result = await response.json()
        if (!cancelled) {
          setData({
            posts: result.posts ?? [],
            total: result.total ?? 0,
            page: result.page ?? currentPage,
            pageSize: result.pageSize ?? PAGE_SIZE,
            totalPages: result.totalPages ?? 0,
          })
        }
      } catch (error) {
        console.error('Failed to fetch blog posts:', error)
        if (!cancelled) {
          setData({ posts: [], total: 0, page: currentPage, pageSize: PAGE_SIZE, totalPages: 0 })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPosts()
    return () => { cancelled = true }
  }, [currentPage])

  const { posts, totalPages } = data

  return (
    <div className="min-h-screen bg-background">
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {t.blog.title}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              {t.blog.subtitle}
            </p>
          </div>

          {loading ? (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                  <Skeleton className="aspect-video w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              {t.blog.noPosts}
            </p>
          ) : (
            <>
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post: any) => (
                  <Link
                    key={post.id}
                    to="/$lang/blog/$slug"
                    params={{ lang, slug: post.slug }}
                    className="group rounded-xl border border-border bg-card p-0 overflow-hidden transition-all hover:shadow-lg hover:border-primary/20"
                  >
                    {post.coverImage ? (
                      <div className="aspect-video w-full overflow-hidden bg-muted">
                        <img
                          src={post.coverImage}
                          alt={post.title}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video w-full bg-muted" />
                    )}
                    <div className="p-4">
                      <h2 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-2">
                        {post.title}
                      </h2>
                      {post.excerpt && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        {post.authorName && (
                          <span>
                            {t.blog.by} {post.authorName}
                          </span>
                        )}
                        {post.publishedAt && (
                          <span>
                            {t.blog.publishedOn}{' '}
                            {new Date(post.publishedAt).toLocaleDateString(
                              lang === 'zh-CN' ? 'zh-CN' : 'en-US'
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-12 flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className={currentPage <= 1 ? 'pointer-events-none opacity-50' : ''}
                  >
                    <Link
                      to="/$lang/blog"
                      params={{ lang }}
                      search={{ page: Math.max(1, currentPage - 1) }}
                      className="flex items-center gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {t.actions.previous}
                    </Link>
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : ''}
                  >
                    <Link
                      to="/$lang/blog"
                      params={{ lang }}
                      search={{ page: Math.min(totalPages, currentPage + 1) }}
                      className="flex items-center gap-1"
                    >
                      {t.actions.next}
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
