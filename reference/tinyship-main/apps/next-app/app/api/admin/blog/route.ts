import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db, blogPost, user } from '@libs/database';
import { blogPostStatus } from '@libs/database/schema/blog-post';
import { auth } from '@libs/auth';
import { eq, and, like, desc, asc, count } from 'drizzle-orm';

/**
 * Generate a URL-safe slug from title: lowercase, hyphens, no special chars, random suffix
 */
function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || 'post'}-${suffix}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination params
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const offset = (page - 1) * pageSize;

    // Search by title
    const search = searchParams.get('search');

    // Filter by status (draft/published)
    const statusFilter = searchParams.get('status');

    // Sort params
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortDirection = searchParams.get('sortDirection') || 'desc';

    const whereConditions: any[] = [];

    if (search && search.trim()) {
      whereConditions.push(like(blogPost.title, `%${search.trim()}%`));
    }

    if (statusFilter && statusFilter !== 'all') {
      whereConditions.push(eq(blogPost.status, statusFilter));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(blogPost)
      .where(whereClause);

    const total = totalResult[0]?.count ?? 0;

    // Build order by
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
              : asc(blogPost.createdAt);

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
      .offset(offset);

    return NextResponse.json({
      posts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, slug, content, excerpt, coverImage, status } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const finalSlug = slug && typeof slug === 'string' && slug.trim()
      ? slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || generateSlug(title)
      : generateSlug(title);

    const finalStatus = status === blogPostStatus.PUBLISHED ? blogPostStatus.PUBLISHED : blogPostStatus.DRAFT;
    const publishedAt = finalStatus === blogPostStatus.PUBLISHED ? new Date() : null;

    await db.insert(blogPost).values({
      id,
      title: title.trim(),
      slug: finalSlug,
      content: (content && typeof content === 'string') ? content : '',
      excerpt: excerpt && typeof excerpt === 'string' ? excerpt : null,
      coverImage: coverImage && typeof coverImage === 'string' ? coverImage : null,
      authorId: session.user.id,
      status: finalStatus,
      publishedAt,
    });

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
      .where(eq(blogPost.id, id));

    return NextResponse.json(created);
  } catch (error) {
    console.error('Error creating blog post:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
