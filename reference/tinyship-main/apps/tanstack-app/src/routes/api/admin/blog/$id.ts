import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/blog/$id')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request, params }: { request: Request; params: { id: string } }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { db, blogPost, user } = await import('@libs/database')
          const { eq } = await import('drizzle-orm')

          const { id } = params

          const [post] = await db
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

          if (!post) {
            return Response.json({ error: 'Not found' }, { status: 404 })
          }

          return Response.json(post)
        } catch (error) {
          console.error('Error fetching blog post:', error)
          return Response.json({ error: 'Internal Server Error' }, { status: 500 })
        }
      }),

      PATCH: withCfDb(async ({ request, params }: { request: Request; params: { id: string } }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { db, blogPost, user } = await import('@libs/database')
          const { blogPostStatus } = await import('@libs/database/schema/blog-post')
          const { eq } = await import('drizzle-orm')

          const { id } = params

          const [existing] = await db.select().from(blogPost).where(eq(blogPost.id, id))

          if (!existing) {
            return Response.json({ error: 'Not found' }, { status: 404 })
          }

          const body = await request.json()
          const { title, slug, content, excerpt, coverImage, status } = body

          const updates: Record<string, unknown> = {
            updatedAt: new Date(),
          }

          if (title !== undefined && typeof title === 'string') {
            updates.title = title.trim()
          }
          if (slug !== undefined && typeof slug === 'string') {
            updates.slug =
              slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || existing.slug
          }
          if (content !== undefined && typeof content === 'string') {
            updates.content = content
          }
          if (excerpt !== undefined) {
            updates.excerpt = excerpt && typeof excerpt === 'string' ? excerpt : null
          }
          if (coverImage !== undefined) {
            updates.coverImage = coverImage && typeof coverImage === 'string' ? coverImage : null
          }

          if (status !== undefined && typeof status === 'string') {
            updates.status = status === blogPostStatus.PUBLISHED ? blogPostStatus.PUBLISHED : blogPostStatus.DRAFT

            if (updates.status === blogPostStatus.PUBLISHED && !existing.publishedAt) {
              updates.publishedAt = new Date()
            }
          }

          await db.update(blogPost).set(updates).where(eq(blogPost.id, id))

          const [updated] = await db
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

          return Response.json(updated)
        } catch (error) {
          console.error('Error updating blog post:', error)
          return Response.json({ error: 'Internal Server Error' }, { status: 500 })
        }
      }),

      DELETE: withCfDb(async ({ request, params }: { request: Request; params: { id: string } }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { db, blogPost } = await import('@libs/database')
          const { eq } = await import('drizzle-orm')

          const { id } = params

          const [existing] = await db.select().from(blogPost).where(eq(blogPost.id, id))

          if (!existing) {
            return Response.json({ error: 'Not found' }, { status: 404 })
          }

          await db.delete(blogPost).where(eq(blogPost.id, id))

          return Response.json({ success: true })
        } catch (error) {
          console.error('Error deleting blog post:', error)
          return Response.json({ error: 'Internal Server Error' }, { status: 500 })
        }
      }),
    },
  },
})
