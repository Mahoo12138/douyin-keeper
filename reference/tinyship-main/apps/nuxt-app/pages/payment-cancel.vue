<template>
  <div>
    <!-- SEO Head -->
    <Head>
      <title>{{ $t('payment.metadata.cancel.title') }}</title>
      <meta name="description" :content="$t('payment.metadata.cancel.description')" />
      <meta name="keywords" :content="$t('payment.metadata.cancel.keywords')" />
    </Head>

    <div class="container max-w-2xl py-20">
      <div class="flex flex-col items-center text-center space-y-6">
        <div class="rounded-full bg-red-100 p-3">
          <XCircle class="h-12 w-12 text-red-600" />
        </div>
        
        <h1 class="text-3xl font-bold">
          {{ $t('payment.result.cancel.title') }}
        </h1>
        
        <p class="text-muted-foreground">
          {{ $t('payment.result.cancel.description') }}
        </p>

        <div class="flex flex-col sm:flex-row gap-4 pt-6">
          <Button as-child>
            <NuxtLink :to="localePath('/pricing')">
              {{ $t('payment.result.cancel.actions.tryAgain') }}
            </NuxtLink>
          </Button>
          
          <Button variant="outline" as-child>
            <NuxtLink to="/support">
              {{ $t('payment.result.cancel.actions.contactSupport') }}
            </NuxtLink>
          </Button>

          <Button variant="ghost" as-child>
            <NuxtLink :to="localePath('/')">
              {{ $t('payment.result.cancel.actions.backToHome') }}
            </NuxtLink>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { XCircle } from 'lucide-vue-next'

// Router and i18n
const localePath = useLocalePath()
const { t } = useI18n()

// SEO
useHead({
  title: () => t('payment.metadata.cancel.title'),
  meta: [
    { name: 'description', content: () => t('payment.metadata.cancel.description') },
    { name: 'keywords', content: () => t('payment.metadata.cancel.keywords') }
  ]
})
</script> 