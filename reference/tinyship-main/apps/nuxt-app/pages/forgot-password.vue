<template>
  <Card class="w-[380px]">
    <!-- Email sent confirmation state -->
    <div v-if="emailSent" class="text-center space-y-4 p-6">
      <h3 class="font-medium">{{ t('auth.forgetPassword.verification.title') }}</h3>
      <p class="text-muted-foreground">
        {{ t('auth.forgetPassword.verification.sent') }} <span class="font-medium">{{ sentEmail }}</span>
      </p>
      <p class="text-sm text-muted-foreground">
        {{ t('auth.forgetPassword.verification.checkSpam') }}
      </p>
    </div>

    <!-- Forgot password form -->
    <div v-else>
      <CardHeader class="text-center">
        <CardTitle class="text-xl">{{ t('auth.forgetPassword.title') }}</CardTitle>
        <CardDescription>
          {{ t('auth.forgetPassword.description') }}
        </CardDescription>
      </CardHeader>
      
      <CardContent class="flex flex-col gap-6">
        <form @submit="onSubmit">
          <div class="grid gap-6">
            <!-- Email input -->
            <div class="grid gap-2">
              <Label for="email">{{ t('auth.forgetPassword.email') }}</Label>
              <div class="relative">
                <Input
                  id="email"
                  v-bind="emailAttrs"
                  v-model="email"
                  type="email"
                  :placeholder="t('auth.forgetPassword.emailPlaceholder')"
                  :class="cn(errors.email && 'border-destructive')"
                  :aria-invalid="errors.email ? 'true' : 'false'"
                  :disabled="loading"
                  autocomplete="email"
                  autocapitalize="none"
                  autocorrect="off"
                />
                <span v-if="errors.email" class="text-destructive text-xs absolute -bottom-5 left-0">
                  {{ errors.email }}
                </span>
              </div>
            </div>

            <!-- Captcha component (if enabled) -->
            <div v-if="captchaEnabled" class="grid gap-2">
              <VueTurnstile
                :key="turnstileKey"
                ref="turnstileRef"
                :site-key="captchaSiteKey"
                v-model="turnstileToken"
                size="flexible"
                @error="onTurnstileError"
                @expired="onTurnstileExpired"
                :theme="isDark ? 'dark' : 'light'"
              />
              <span v-if="turnstileError" class="text-destructive text-xs">
                {{ turnstileError }}
              </span>
            </div>

            <!-- Submit button -->
            <Button 
              type="submit" 
              :disabled="loading || (captchaEnabled && !turnstileToken)"
            >
              <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
              {{ loading ? t('auth.forgetPassword.submitting') : t('auth.forgetPassword.submit') }}
            </Button>
          </div>
        </form>

        <!-- Error display -->
        <FormError v-if="errorMessage" :message="errorMessage" :code="errorCode" />

        <!-- Terms notice -->
        <div class="text-muted-foreground text-center text-xs text-balance">
          {{ t('auth.forgetPassword.termsNotice') }} 
          <a href="#" class="underline underline-offset-4 hover:text-primary">{{ t('auth.forgetPassword.termsOfService') }}</a>
          {{ t('common.and') }} 
          <a href="#" class="underline underline-offset-4 hover:text-primary">{{ t('auth.forgetPassword.privacyPolicy') }}</a>.
        </div>
      </CardContent>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { useForm } from 'vee-validate'
import { createValidators } from '@libs/validators'
import { authClientVue } from '@libs/auth/authClient'
import { cn } from '@/lib/utils'
import VueTurnstile from 'vue-turnstile'
import { Loader2 } from 'lucide-vue-next'

// Initialize internationalization and navigation
const { t } = useI18n()
const localePath = useLocalePath()
const { locale } = useI18n()

// Set layout
definePageMeta({
  layout: 'auth'
})

// Set page title and meta tags
useSeoMeta({
  title: t('auth.metadata.forgotPassword.title'),
  description: t('auth.metadata.forgotPassword.description'),
  keywords: t('auth.metadata.forgotPassword.keywords')
})

// State management
const loading = ref(false)
const errorMessage = ref('')
const errorCode = ref('')
const emailSent = ref(false)
const sentEmail = ref('')

// Get runtime configuration
const runtimeConfig = useRuntimeConfig()

// Captcha related state
const captchaEnabled = computed(() => {
  return runtimeConfig.public.captchaEnabled !== 'false'
})

const captchaSiteKey = computed(() => {
  const siteKey = runtimeConfig.public.turnstileSiteKey as string | undefined
  return siteKey || '1x00000000000000000000AA' // Test key
})

const turnstileToken = ref('')
const turnstileError = ref('')
const turnstileRef = ref()
const turnstileKey = ref(0) // Force re-render Turnstile

// Theme detection (simplified version)
const isDark = ref(false)

// Turnstile event handlers
const onTurnstileError = () => {
  turnstileError.value = t('auth.forgetPassword.errors.captchaError')
  turnstileToken.value = ''
}

const onTurnstileExpired = () => {
  turnstileError.value = t('auth.forgetPassword.errors.captchaExpired')
  turnstileToken.value = ''
}

// Create internationalized validators
const { forgetPasswordSchema } = createValidators(t)

// Form validation
const { handleSubmit, errors, defineField, isSubmitting } = useForm({
  validationSchema: forgetPasswordSchema,
  initialValues: {
    email: ''
  }
})

// Define form fields
const [email, emailAttrs] = defineField('email', {
  validateOnBlur: true
})

// Handle form submission
const onSubmit = handleSubmit(async (values) => {
  // Validate captcha (if enabled)
  if (captchaEnabled.value && !turnstileToken.value) {
    errorMessage.value = t('auth.forgetPassword.errors.captchaRequired')
    errorCode.value = 'CAPTCHA_REQUIRED'
    return
  }

  loading.value = true
  errorMessage.value = ''
  errorCode.value = ''
  turnstileError.value = ''

  const fetchOptions: any = {}
  
  // If captcha is enabled, add captcha token to request headers
  if (captchaEnabled.value && turnstileToken.value) {
    fetchOptions.headers = {
      'x-captcha-response': turnstileToken.value,
      'X-Locale': locale.value
    }
  } else {
    fetchOptions.headers = {
      'X-Locale': locale.value
    }
  }

  const result = await authClientVue.requestPasswordReset({
    email: values.email,
    redirectTo: `/${locale.value}/reset-password`,
    fetchOptions
  })

  // Handle error response (better-auth 1.4+ returns union type)
  if ('error' in result && result.error) {
    errorMessage.value = result.error.message || t('common.unexpectedError')
    errorCode.value = result.error.code || 'UNKNOWN_ERROR'
    
    // If validation fails, reset turnstile token and force re-render
    if (captchaEnabled.value) {
      turnstileToken.value = ''
      turnstileKey.value += 1
    }
    loading.value = false
    return
  }

  emailSent.value = true
  sentEmail.value = values.email
  loading.value = false
})
</script> 