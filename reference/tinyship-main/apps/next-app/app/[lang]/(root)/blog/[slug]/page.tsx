import Link from "next/link";

import { notFound } from "next/navigation";
import { db, blogPost, user } from "@libs/database";
import { blogPostStatus } from "@libs/database/schema/blog-post";
import { eq, and } from "drizzle-orm";
import { translations } from "@libs/i18n";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import { ChevronLeft } from "lucide-react";

type Props = {
  params: Promise<{ lang: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const t = translations[lang as keyof typeof translations];

  const [post] = await db
    .select({
      title: blogPost.title,
      excerpt: blogPost.excerpt,
    })
    .from(blogPost)
    .where(and(eq(blogPost.slug, slug), eq(blogPost.status, blogPostStatus.PUBLISHED)))
    .limit(1);

  if (!post) {
    return {
      title: t.blog.title,
    };
  }

  return {
    title: `${post.title} - ${t.blog.title}`,
    description: post.excerpt || t.blog.metadata.description,
    keywords: t.blog.metadata.keywords,
  };
}

export default async function BlogDetailPage({ params }: Props) {
  const { lang, slug } = await params;
  const t = translations[lang as keyof typeof translations];

  const [post] = await db
    .select({
      id: blogPost.id,
      title: blogPost.title,
      slug: blogPost.slug,
      content: blogPost.content,
      excerpt: blogPost.excerpt,
      coverImage: blogPost.coverImage,
      publishedAt: blogPost.publishedAt,
      authorName: user.name,
    })
    .from(blogPost)
    .leftJoin(user, eq(blogPost.authorId, user.id))
    .where(and(eq(blogPost.slug, slug), eq(blogPost.status, blogPostStatus.PUBLISHED)))
    .limit(1);

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <article className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
        <Link
          href={`/${lang}/blog`}
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
                {t.blog.publishedOn}{" "}
                {new Date(post.publishedAt).toLocaleDateString(lang === "zh-CN" ? "zh-CN" : "en-US")}
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
            href={`/${lang}/blog`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            {t.blog.backToBlog}
          </Link>
        </footer>
      </article>
    </div>
  );
}
