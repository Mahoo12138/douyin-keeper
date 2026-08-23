<template>
  <div class="min-h-screen bg-background">
    <article v-if="post" class="mx-auto max-w-3xl px-6 py-16 lg:px-8">
      <NuxtLink
        :to="localePath('/blog')"
        class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
      >
        <ChevronLeft class="h-4 w-4" />
        {{ t('blog.backToBlog') }}
      </NuxtLink>

      <header class="mb-8">
        <h1 class="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          {{ post.title }}
        </h1>
        <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span v-if="post.authorName">
            {{ t('blog.by') }} {{ post.authorName }}
          </span>
          <span v-if="post.publishedAt">
            {{ t('blog.publishedOn') }}
            {{ formatDate(post.publishedAt) }}
          </span>
        </div>
        <div v-if="post.coverImage" class="relative mt-6 aspect-video w-full overflow-hidden rounded-lg bg-muted">
          <img
            :src="post.coverImage"
            :alt="post.title"
            class="h-full w-full object-cover"
          />
        </div>
      </header>

      <article class="prose dark:prose-invert max-w-none">
        <VueMarkdown :source="post?.content ?? ''" />
      </article>

      <footer class="mt-12 pt-8 border-t border-border">
        <NuxtLink
          :to="localePath('/blog')"
          class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft class="h-4 w-4" />
          {{ t('blog.backToBlog') }}
        </NuxtLink>
      </footer>
    </article>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft } from 'lucide-vue-next'
import VueMarkdown from 'vue-markdown-render'

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()

const slug = computed(() => route.params.slug as string)

const { data: post, error } = await useFetch<{
  id: string
  title: string
  slug: string
  content: string
  excerpt: string | null
  coverImage: string | null
  publishedAt: string | null
  authorName: string | null
}>(() => `/api/blog/${slug.value}`, {
  key: `blog-${slug.value}`,
})

if (error.value || !post.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Blog post not found',
  })
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US')
}

useSeoMeta({
  title: () => `${post.value!.title} - ${t('blog.title')}`,
  description: () => post.value!.excerpt || t('blog.metadata.description'),
  keywords: () => t('blog.metadata.keywords'),
})
</script>
