<template>
  <div>
    <Card class="w-[380px]">
      <CardHeader class="text-center">
        <CardTitle class="text-xl">{{ t('auth.phone.title') }}</CardTitle>
        <CardDescription>
          {{ t('auth.phone.description') }}
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-6">
        <PhoneLoginForm />
        <div class="text-muted-foreground text-center text-xs text-balance [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary">
          {{ t('auth.phone.termsNotice') }} <a href="#">{{ t('auth.phone.termsOfService') }}</a>
          {{ t('common.and') }} <a href="#">{{ t('auth.phone.privacyPolicy') }}</a>.
        </div>
        <div class="flex justify-center gap-4 text-sm">
          <NuxtLink :to="localePath('/signin')" class="text-primary hover:underline">
            {{ t('auth.signin.title') }}
          </NuxtLink>
          <span class="text-muted-foreground">|</span>
          <NuxtLink :to="localePath('/signup')" class="text-primary hover:underline">
            {{ t('auth.signup.createAccount') }}
          </NuxtLink>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Set page metadata
definePageMeta({
  layout: 'auth',
  title: 'Phone Login'
})

// Get i18n composable
const { t } = useI18n()

// Get localized path function
const localePath = useLocalePath()

// Set page head with reactive translations
useHead({
  title: () => t('auth.metadata.phone.title'),
  meta: [
    { name: 'description', content: () => t('auth.metadata.phone.description') },
    { name: 'keywords', content: () => t('auth.metadata.phone.keywords') }
  ]
})
</script> 