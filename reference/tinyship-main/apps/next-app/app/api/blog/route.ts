import { NextRequest, NextResponse } from 'next/server';
import { db, blogPost, user } from '@libs/database';
import { blogPostStatus } from '@libs/database/schema/blog-post';
import { eq, desc, count } from 'drizzle-orm';

/**
 * Public API: List published blog posts only.
 * No auth required.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const offset = (page - 1) * pageSize;

    const totalResult = await db
      .select({ count: count() })
      .from(blogPost)
      .where(eq(blogPost.status, blogPostStatus.PUBLISHED));

    const total = totalResult[0]?.count ?? 0;

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
      .where(eq(blogPost.status, blogPostStatus.PUBLISHED))
      .orderBy(desc(blogPost.publishedAt))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({
      posts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Error fetching published blog posts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
