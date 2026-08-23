import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db, blogPost, user } from '@libs/database';
import { blogPostStatus } from '@libs/database/schema/blog-post';
import { auth } from '@libs/auth';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
      .where(eq(blogPost.id, id));

    if (!post) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(post);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [existing] = await db
      .select()
      .from(blogPost)
      .where(eq(blogPost.id, id));

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { title, slug, content, excerpt, coverImage, status } = body;

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (title !== undefined && typeof title === 'string') {
      updates.title = title.trim();
    }
    if (slug !== undefined && typeof slug === 'string') {
      updates.slug = slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || existing.slug;
    }
    if (content !== undefined && typeof content === 'string') {
      updates.content = content;
    }
    if (excerpt !== undefined) {
      updates.excerpt = excerpt && typeof excerpt === 'string' ? excerpt : null;
    }
    if (coverImage !== undefined) {
      updates.coverImage = coverImage && typeof coverImage === 'string' ? coverImage : null;
    }

    if (status !== undefined && typeof status === 'string') {
      updates.status = status === blogPostStatus.PUBLISHED ? blogPostStatus.PUBLISHED : blogPostStatus.DRAFT;

      if (updates.status === blogPostStatus.PUBLISHED && !existing.publishedAt) {
        updates.publishedAt = new Date();
      }
    }

    await db
      .update(blogPost)
      .set(updates)
      .where(eq(blogPost.id, id));

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
      .where(eq(blogPost.id, id));

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating blog post:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [existing] = await db
      .select()
      .from(blogPost)
      .where(eq(blogPost.id, id));

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await db.delete(blogPost).where(eq(blogPost.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
