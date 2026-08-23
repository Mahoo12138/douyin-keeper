import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/blog/$slug')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request, params }: { request: Request; params: { slug: string } }) => {
        try {
          const { db, blogPost, user } = await import('@libs/database')
          const { blogPostStatus } = await import('@libs/database/schema/blog-post')
          const { eq, and } = await import('drizzle-orm')

          const { slug } = params

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
            .where(and(eq(blogPost.slug, slug), eq(blogPost.status, blogPostStatus.PUBLISHED)))

          if (!post) {
            return Response.json({ error: 'Not found' }, { status: 404 })
          }

          return Response.json(post)
        } catch (error) {
          console.error('Error fetching blog post by slug:', error)
          return Response.json({ error: 'Internal Server Error' }, { status: 500 })
        }
      }),
    },
  },
})
