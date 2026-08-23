<template>
  <Card class="w-[380px]">
    <CardHeader class="text-center">
      <CardTitle class="text-xl">{{ t('auth.signup.createAccount') }}</CardTitle>
      <CardDescription>
        {{ t('auth.signup.socialSignup') }}
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-6">
      <SocialAuth />
      <div class="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
        <span class="bg-card relative z-10 px-2 text-muted-foreground">
          {{ t('auth.signup.continueWith') }}
        </span>
      </div>
      <div class="flex flex-col gap-4">
        <SignupForm />
      </div>
      <div class="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
        {{ t('auth.signup.termsNotice') }} <a href="#">{{ t('auth.signup.termsOfService') }}</a>
        {{ t('common.and') }} <a href="#">{{ t('auth.signup.privacyPolicy') }}</a>.
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
// Initialize internationalization
const { t } = useI18n()

// Set layout
definePageMeta({
  layout: 'auth'
})

// Set page title and meta tags
useSeoMeta({
  title: t('auth.metadata.signup.title'),
  description: t('auth.metadata.signup.description'),
  keywords: t('auth.metadata.signup.keywords')
})
</script>

