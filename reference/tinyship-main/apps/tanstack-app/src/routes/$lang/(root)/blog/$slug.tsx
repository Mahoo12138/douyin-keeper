import { createFileRoute, Link } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { useState, useEffect } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import ReactMarkdown from 'react-markdown'
import { ChevronLeft } from 'lucide-react'
import { Skeleton } from '@libs/react-shared/ui/skeleton'

export const Route = createFileRoute('/$lang/(root)/blog/$slug')({
  head: ({ params }) => seoHead(params.lang, (t) => t.blog.metadata),
  component: BlogDetailPage,
})

function BlogDetailPage() {
  const { lang, slug } = Route.useParams()
  const { t } = useTranslation()
  const [post, setPost] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchPost() {
      setLoading(true)
      setNotFound(false)
      try {
        const response = await fetch(`/api/blog/${slug}`)
        if (!response.ok) {
          if (!cancelled) setNotFound(true)
          return
        }
        const data = await response.json()
        if (!cancelled) setPost(data)
      } catch (error) {
        console.error('Failed to fetch blog post:', error)
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPost()
    return () => { cancelled = true }
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <article className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
          <Skeleton className="h-4 w-32 mb-8" />
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-4 w-48 mb-6" />
          <Skeleton className="aspect-video w-full rounded-lg mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </article>
      </div>
    )
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">{t.blog.noPosts}</h1>
        <Link
          to="/$lang/blog"
          params={{ lang }}
          search={{ page: 1 }}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          {t.blog.backToBlog}
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <article className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
        <Link
          to="/$lang/blog"
          params={{ lang }}
          search={{ page: 1 }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {t.blog.backToBlog}
        </Link>

        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {post.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
          {post.coverImage && (
            <div className="mt-6 aspect-video w-full overflow-hidden rounded-lg bg-muted">
              <img
                src={post.coverImage}
                alt={post.title}
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </header>

        <div className="prose dark:prose-invert max-w-none">
          <ReactMarkdown>{post.content}</ReactMarkdown>
        </div>

        <footer className="mt-12 pt-8 border-t border-border">
          <Link
            to="/$lang/blog"
            params={{ lang }}
            search={{ page: 1 }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            {t.blog.backToBlog}
          </Link>
        </footer>
      </article>
    </div>
  )
}
