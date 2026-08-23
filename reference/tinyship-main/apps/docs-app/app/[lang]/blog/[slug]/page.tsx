import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { TableOfContents } from 'fumadocs-core/toc';
import type { MDXComponents } from 'mdx/types';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { blog } from '@/lib/source';
import { config } from '@config';
import { translations } from '@libs/i18n';

// MDX component type that accepts components prop
type MDXContent = (props: { components?: MDXComponents }) => React.ReactNode;

// Extended type for blog post data including custom frontmatter fields
interface BlogPostData {
  title: string;
  description?: string;
  author: string;
  authorRole?: string;
  date: string | Date;
  category?: string;
  body: MDXContent;
  toc: TableOfContents;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const page = blog.getPage([slug], lang);

  if (!page) return {};

  return {
    title: page.data.title,
    description: page.data.description,
  };
}

export async function generateStaticParams() {
  const params: { lang: string; slug: string }[] = [];

  for (const locale of config.app.i18n.locales) {
    const pages = blog.getPages(locale);
    for (const page of pages) {
      params.push({
        lang: locale,
        slug: page.slugs[0],
      });
    }
  }

  return params;
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const t = translations[lang as keyof typeof translations] || translations.en;
  const page = blog.getPage([slug], lang);

  if (!page) notFound();

  // Type assertion for blog data with custom frontmatter fields
  const data = page.data as unknown as BlogPostData;
  const Mdx = data.body;

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/${lang}/blog`}
          className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
        >
          {t.docs.blog.back}
        </Link>
      </div>

      {/* Date and Category */}
      <div className="flex items-center gap-4 text-sm mb-4">
        <time
          dateTime={String(data.date)}
          className="text-fd-muted-foreground"
        >
          {new Date(data.date as string).toLocaleDateString(
            lang === 'zh-CN' ? 'zh-CN' : 'en-US',
            {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }
          )}
        </time>
        {data.category && (
          <span className="px-3 py-1 rounded-full bg-fd-muted text-fd-muted-foreground text-xs font-medium">
            {data.category}
          </span>
        )}
      </div>

      {/* Article Header */}
      <header className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{data.title}</h1>
        {data.description && (
          <p className="text-xl text-fd-muted-foreground leading-relaxed">
            {data.description}
          </p>
        )}
      </header>

      {/* Author */}
      <div className="flex items-center gap-3 mb-8 pb-8 border-b border-fd-border">
        <div className="w-10 h-10 rounded-full bg-fd-primary/10 flex items-center justify-center text-fd-primary font-medium">
          {data.author.charAt(0)}
        </div>
        <div>
          <p className="font-medium text-sm">{data.author}</p>
          {data.authorRole && (
            <p className="text-fd-muted-foreground text-sm">
              {data.authorRole}
            </p>
          )}
        </div>
      </div>

      {/* Table of Contents */}
      {data.toc && data.toc.length > 0 && (
        <div className="mb-8">
          <InlineTOC items={data.toc} />
        </div>
      )}

      {/* Article Content */}
      <article className="prose prose-fd max-w-none">
        <Mdx components={defaultMdxComponents} />
      </article>
    </main>
  );
}
