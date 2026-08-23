<template>
  <div class="min-h-screen bg-background">
    <section class="py-16 sm:py-24">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div class="mx-auto max-w-2xl text-center mb-12">
          <h1 class="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {{ t('blog.title') }}
          </h1>
          <p class="mt-4 text-lg text-muted-foreground">
            {{ t('blog.subtitle') }}
          </p>
        </div>

        <div v-if="pending" class="text-center text-muted-foreground py-12">
          {{ t('common.loading') }}
        </div>

        <template v-else-if="data?.posts?.length">
          <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <NuxtLink
              v-for="post in data.posts"
              :key="post.id"
              :to="localePath(`/blog/${post.slug}`)"
              class="group rounded-xl border border-border bg-card p-0 overflow-hidden transition-all hover:shadow-lg hover:border-primary/20"
            >
              <div v-if="post.coverImage" class="relative aspect-video w-full overflow-hidden bg-muted">
                <img
                  :src="post.coverImage"
                  :alt="post.title"
                  class="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <div v-else class="aspect-video w-full bg-muted" />
              <div class="p-4">
                <h2 class="font-semibold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {{ post.title }}
                </h2>
                <p v-if="post.excerpt" class="mt-2 text-sm text-muted-foreground line-clamp-2">
                  {{ post.excerpt }}
                </p>
                <div class="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span v-if="post.authorName">
                    {{ t('blog.by') }} {{ post.authorName }}
                  </span>
                  <span v-if="post.publishedAt">
                    {{ t('blog.publishedOn') }}
                    {{ formatDate(post.publishedAt) }}
                  </span>
                </div>
              </div>
            </NuxtLink>
          </div>

          <div v-if="data.totalPages > 1" class="mt-12 flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              :disabled="currentPage <= 1"
              @click="goToPage(currentPage - 1)"
            >
              <ChevronLeft class="h-4 w-4 mr-1" />
              {{ t('actions.previous') }}
            </Button>
            <span class="text-sm text-muted-foreground">
              {{ currentPage }} / {{ data.totalPages }}
            </span>
            <Button
              variant="outline"
              size="sm"
              :disabled="currentPage >= data.totalPages"
              @click="goToPage(currentPage + 1)"
            >
              {{ t('actions.next') }}
              <ChevronRight class="h-4 w-4 ml-1" />
            </Button>
          </div>
        </template>

        <p v-else class="text-center text-muted-foreground py-12">
          {{ t('blog.noPosts') }}
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const currentPage = computed(() => Math.max(1, parseInt((route.query.page as string) || '1', 10)))

const { data, pending } = await useFetch<{
  posts: Array<{
    id: string
    title: string
    slug: string
    excerpt: string | null
    coverImage: string | null
    publishedAt: string | null
    authorName: string | null
  }>
  total: number
  page: number
  pageSize: number
  totalPages: number
}>('/api/blog', {
  query: computed(() => ({ page: currentPage.value, pageSize: 12 })),
})

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US')
}

const goToPage = (page: number) => {
  if (page >= 1 && data.value && page <= data.value.totalPages) {
    navigateTo({
      path: localePath('/blog'),
      query: { page: page.toString() },
    })
  }
}

useSeoMeta({
  title: () => t('blog.metadata.title'),
  description: () => t('blog.metadata.description'),
  keywords: () => t('blog.metadata.keywords'),
})
</script>
