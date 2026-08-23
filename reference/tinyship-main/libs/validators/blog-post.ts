import { z } from 'zod'

type TranslationFunction = (key: string, params?: Record<string, any>) => string

/**
 * Factory for blog post Zod schemas with i18n error messages.
 * Follows the same pattern as createValidators() in user.ts.
 *
 * Status values are inlined to avoid importing drizzle-orm (server-only)
 * into client bundles.
 */
export function createBlogPostValidators(t: TranslationFunction) {
  const blogPostFormSchema = z.object({
    title: z.string()
      .min(1, t('validators.blog.title.required'))
      .max(200, t('validators.blog.title.maxLength', { max: 200 })),
    slug: z.string()
      .max(200, t('validators.blog.slug.maxLength', { max: 200 }))
      .refine(
        (val) => !val || /^[a-z0-9-]*$/.test(val),
        t('validators.blog.slug.invalid'),
      )
      .optional()
      .or(z.literal('')),
    excerpt: z.string()
      .max(500, t('validators.blog.excerpt.maxLength', { max: 500 }))
      .optional()
      .or(z.literal(''))
      .nullable(),
    coverImage: z.string()
      .optional()
      .or(z.literal(''))
      .nullable(),
    status: z.enum(['draft', 'published'], {
      error: t('validators.blog.status.invalid'),
    }),
    content: z.string().optional().or(z.literal('')),
  })

  return { blogPostFormSchema }
}

export type BlogPostValidators = ReturnType<typeof createBlogPostValidators>
