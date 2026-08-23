'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface BlogPost {
  url: string;
  title: string;
  description?: string;
  category?: string;
  date: string;
}

interface BlogListProps {
  posts: BlogPost[];
  categories: string[];
  lang: string;
  translations: {
    allPosts: string;
    previous: string;
    next: string;
    noPostsYet: string;
  };
}

const POSTS_PER_PAGE = 10;

export function BlogList({ posts, categories, lang, translations }: BlogListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get current category and page from URL
  const currentCategory = searchParams.get('category');
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  // Filter posts by category
  const filteredPosts = useMemo(() => {
    return currentCategory
      ? posts.filter((post) => post.category === currentCategory)
      : posts;
  }, [posts, currentCategory]);

  // Pagination
  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const paginatedPosts = filteredPosts.slice(startIndex, startIndex + POSTS_PER_PAGE);

  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  // Build URL with params
  const buildUrl = useCallback(
    (category: string | null, page: number) => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (page > 1) params.set('page', String(page));
      const query = params.toString();
      return `/${lang}/blog${query ? `?${query}` : ''}`;
    },
    [lang]
  );

  const handleCategoryChange = useCallback(
    (category: string | null) => {
      router.push(buildUrl(category, 1));
    },
    [router, buildUrl]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      router.push(buildUrl(currentCategory, page));
    },
    [router, buildUrl, currentCategory]
  );

  return (
    <div className="flex flex-col lg:flex-row gap-12">
      {/* Category Sidebar */}
      <aside className="lg:w-48 shrink-0">
        <nav className="lg:sticky lg:top-20">
          <ul className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-4 lg:pb-0">
            <li>
              <button
                onClick={() => handleCategoryChange(null)}
                className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full text-left ${
                  currentCategory === null
                    ? 'bg-fd-primary text-fd-primary-foreground'
                    : 'text-fd-muted-foreground hover:text-fd-foreground hover:bg-fd-muted'
                }`}
              >
                {translations.allPosts}
              </button>
            </li>
            {categories.map((category) => (
              <li key={category}>
                <button
                  onClick={() => handleCategoryChange(category)}
                  className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full text-left ${
                    currentCategory === category
                      ? 'bg-fd-primary text-fd-primary-foreground'
                      : 'text-fd-muted-foreground hover:text-fd-foreground hover:bg-fd-muted'
                  }`}
                >
                  {category}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Posts List */}
      <div className="flex-1 flex flex-col gap-4">
        {paginatedPosts.map((post) => (
          <Link
            key={post.url}
            href={post.url}
            className="block bg-fd-card rounded-xl border border-fd-border p-6 transition-all hover:border-fd-primary hover:bg-fd-accent/50"
          >
            {/* Title */}
            <h2 className="text-lg font-semibold mb-2">{post.title}</h2>

            {/* Description */}
            {post.description && (
              <p className="text-fd-muted-foreground text-sm leading-relaxed mb-4">
                {post.description}
              </p>
            )}

            {/* Category and Date */}
            <div className="flex items-center gap-2 text-sm text-fd-muted-foreground">
              {post.category && (
                <>
                  <span>{post.category}</span>
                  <span>·</span>
                </>
              )}
              <time dateTime={post.date}>
                {new Date(post.date).toLocaleDateString(
                  lang === 'zh-CN' ? 'zh-CN' : 'en-US',
                  {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  }
                )}
              </time>
            </div>
          </Link>
        ))}

        {paginatedPosts.length === 0 && (
          <p className="text-center text-fd-muted-foreground py-12">
            {translations.noPostsYet}
          </p>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 pt-8 border-t border-fd-border">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={!hasPrevious}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                hasPrevious
                  ? 'bg-fd-muted hover:bg-fd-accent text-fd-foreground'
                  : 'bg-fd-muted/50 text-fd-muted-foreground cursor-not-allowed'
              }`}
            >
              ← {translations.previous}
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={!hasNext}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                hasNext
                  ? 'bg-fd-muted hover:bg-fd-accent text-fd-foreground'
                  : 'bg-fd-muted/50 text-fd-muted-foreground cursor-not-allowed'
              }`}
            >
              {translations.next} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
