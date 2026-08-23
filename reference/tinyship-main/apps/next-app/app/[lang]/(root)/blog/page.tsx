import Link from "next/link";

import { db, blogPost, user } from "@libs/database";
import { blogPostStatus } from "@libs/database/schema/blog-post";
import { eq, desc, count } from "drizzle-orm";
import { translations } from "@libs/i18n";
import type { Metadata } from "next";
import { Button } from "@libs/react-shared/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations];

  return {
    title: t.blog.metadata.title,
    description: t.blog.metadata.description,
    keywords: t.blog.metadata.keywords,
  };
}

export default async function BlogListPage({ params, searchParams }: Props) {
  const { lang } = await params;
  const { page: pageParam } = await searchParams;
  const t = translations[lang as keyof typeof translations];

  const page = Math.max(1, parseInt(pageParam || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const totalResult = await db
    .select({ count: count() })
    .from(blogPost)
    .where(eq(blogPost.status, blogPostStatus.PUBLISHED));

  const total = totalResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const posts = await db
    .select({
      id: blogPost.id,
      title: blogPost.title,
      slug: blogPost.slug,
      excerpt: blogPost.excerpt,
      coverImage: blogPost.coverImage,
      publishedAt: blogPost.publishedAt,
      authorName: user.name,
    })
    .from(blogPost)
    .leftJoin(user, eq(blogPost.authorId, user.id))
    .where(eq(blogPost.status, blogPostStatus.PUBLISHED))
    .orderBy(desc(blogPost.publishedAt))
    .limit(PAGE_SIZE)
    .offset(offset);

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

          {posts.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              {t.blog.noPosts}
            </p>
          ) : (
            <>
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/${lang}/blog/${post.slug}`}
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
                            {t.blog.publishedOn}{" "}
                            {new Date(post.publishedAt).toLocaleDateString(lang === "zh-CN" ? "zh-CN" : "en-US")}
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
                    className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                  >
                    <Link
                      href={page <= 1 ? "#" : `/${lang}/blog?page=${page - 1}`}
                      className="flex items-center gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {t.actions.previous}
                    </Link>
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                  >
                    <Link
                      href={page >= totalPages ? "#" : `/${lang}/blog?page=${page + 1}`}
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
  );
}
