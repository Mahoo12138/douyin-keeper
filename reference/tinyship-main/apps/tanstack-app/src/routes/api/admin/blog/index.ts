import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base || 'post'}-${suffix}`
}

export const Route = createFileRoute('/api/admin/blog/')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { db, blogPost, user } = await import('@libs/database')
          const { blogPostStatus } = await import('@libs/database/schema/blog-post')
          const { eq, and, like, desc, asc, count } = await import('drizzle-orm')

          const { searchParams } = new URL(request.url)

          const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
          const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)))
          const offset = (page - 1) * pageSize

          const search = searchParams.get('search')
          const statusFilter = searchParams.get('status')

          const sortBy = searchParams.get('sortBy') || 'createdAt'
          const sortDirection = searchParams.get('sortDirection') || 'desc'

          const whereConditions: any[] = []

          if (search && search.trim()) {
            whereConditions.push(like(blogPost.title, `%${search.trim()}%`))
          }

          if (statusFilter && statusFilter !== 'all') {
            whereConditions.push(eq(blogPost.status, statusFilter))
          }

          const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined

          const totalResult = await db
            .select({ count: count() })
            .from(blogPost)
            .where(whereClause)

          const total = totalResult[0]?.count ?? 0

          const orderBy =
            sortBy === 'title'
              ? sortDirection === 'desc'
                ? desc(blogPost.title)
                : asc(blogPost.title)
              : sortBy === 'status'
                ? sortDirection === 'desc'
                  ? desc(blogPost.status)
                  : asc(blogPost.status)
                : sortBy === 'publishedAt'
                  ? sortDirection === 'desc'
                    ? desc(blogPost.publishedAt)
                    : asc(blogPost.publishedAt)
                  : sortDirection === 'desc'
                    ? desc(blogPost.createdAt)
                    : asc(blogPost.createdAt)

          const posts = await db
            .select({
              id: blogPost.id,
              title: blogPost.title,
              slug: blogPost.slug,
              excerpt: blogPost.excerpt,
              coverImage: blogPost.coverImage,
              authorId: blogPost.authorId,
              status: blogPost.status,
              publishedAt: blogPost.publishedAt,
              createdAt: blogPost.createdAt,
              updatedAt: blogPost.updatedAt,
              metadata: blogPost.metadata,
              authorName: user.name,
            })
            .from(blogPost)
            .leftJoin(user, eq(blogPost.authorId, user.id))
            .where(whereClause)
            .orderBy(orderBy)
            .limit(pageSize)
            .offset(offset)

          return Response.json({
            posts,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
          })
        } catch (error) {
          console.error('Error fetching blog posts:', error)
          return Response.json({ error: 'Internal Server Error' }, { status: 500 })
        }
      }),

      POST: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { db, blogPost, user } = await import('@libs/database')
          const { blogPostStatus } = await import('@libs/database/schema/blog-post')
          const { eq } = await import('drizzle-orm')

          const body = await request.json()
          const { title, slug, content, excerpt, coverImage, status } = body

          if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return Response.json({ error: 'Title is required' }, { status: 400 })
          }

          const id = crypto.randomUUID()
          const finalSlug =
            slug && typeof slug === 'string' && slug.trim()
              ? slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || generateSlug(title)
              : generateSlug(title)

          const finalStatus = status === blogPostStatus.PUBLISHED ? blogPostStatus.PUBLISHED : blogPostStatus.DRAFT
          const publishedAt = finalStatus === blogPostStatus.PUBLISHED ? new Date() : null

          await db.insert(blogPost).values({
            id,
            title: title.trim(),
            slug: finalSlug,
            content: content && typeof content === 'string' ? content : '',
            excerpt: excerpt && typeof excerpt === 'string' ? excerpt : null,
            coverImage: coverImage && typeof coverImage === 'string' ? coverImage : null,
            authorId: authResult.user.id,
            status: finalStatus,
            publishedAt,
          })

          const [created] = await db
            .select({
              id: blogPost.id,
              title: blogPost.title,
              slug: blogPost.slug,
              content: blogPost.content,
              excerpt: blogPost.excerpt,
              coverImage: blogPost.coverImage,
              authorId: blogPost.authorId,
              status: blogPost.status,
              publishedAt: blogPost.publishedAt,
              createdAt: blogPost.createdAt,
              updatedAt: blogPost.updatedAt,
              metadata: blogPost.metadata,
              authorName: user.name,
            })
            .from(blogPost)
            .leftJoin(user, eq(blogPost.authorId, user.id))
            .where(eq(blogPost.id, id))

          return Response.json(created)
        } catch (error) {
          console.error('Error creating blog post:', error)
          return Response.json({ error: 'Internal Server Error' }, { status: 500 })
        }
      }),
    },
  },
})
