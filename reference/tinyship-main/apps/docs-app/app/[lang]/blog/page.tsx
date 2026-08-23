import type { Metadata } from 'next';
import { blog } from '@/lib/source';
import { config } from '@config';
import { translations } from '@libs/i18n';
import { BlogList } from '@/components/blog-list';

// Extended type for blog post data including custom frontmatter fields
export interface BlogPostData {
  title: string;
  description?: string;
  author: string;
  authorRole?: string;
  date: string | Date;
  category?: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations] || translations.en;

  return {
    title: t.docs.blog.title,
    description: t.docs.blog.description,
  };
}

export async function generateStaticParams() {
  return config.app.i18n.locales.map((locale) => ({
    lang: locale,
  }));
}

export default async function BlogPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations] || translations.en;
  const allPosts = blog.getPages(lang).sort((a, b) => {
    const dataA = a.data as unknown as BlogPostData;
    const dataB = b.data as unknown as BlogPostData;
    const dateA = new Date(dataA.date as string);
    const dateB = new Date(dataB.date as string);
    return dateB.getTime() - dateA.getTime();
  });

  // Extract unique categories
  const categories = Array.from(
    new Set(
      allPosts
        .map((post) => (post.data as unknown as BlogPostData).category)
        .filter((cat): cat is string => Boolean(cat))
    )
  );

  // Serialize posts for client component
  const serializedPosts = allPosts.map((post) => {
    const data = post.data as unknown as BlogPostData;
    return {
      url: post.url,
      title: data.title,
      description: data.description,
      category: data.category,
      date: String(data.date),
    };
  });

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-12">
      {/* Page Header */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold mb-3">{t.docs.blog.title}</h1>
        <p className="text-fd-muted-foreground text-lg">{t.docs.blog.description}</p>
      </div>

      <BlogList
        posts={serializedPosts}
        categories={categories}
        lang={lang}
        translations={{
          allPosts: t.docs.blog.allPosts,
          previous: t.docs.blog.previousPage,
          next: t.docs.blog.nextPage,
          noPostsYet: t.docs.blog.noPosts,
        }}
      />
    </main>
  );
}
