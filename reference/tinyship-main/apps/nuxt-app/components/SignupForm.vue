<template>
  <!-- 
    SignupForm.vue - Registration form component
    Features:
    - User registration form (name, email, password, avatar)
    - Form validation (using vee-validate + zod)
    - Error handling display
    - Captcha verification support
    - Email verification prompt after successful registration
    - Internationalization support
    - Better-Auth integration
  -->
  
      <!-- Email verification prompt state -->
  <div v-if="isVerificationEmailSent && requireEmailVerification" :class="cn('flex flex-col gap-4', className)">
    <Alert class="my-4">
      <Inbox class="h-4 w-4" />
      <AlertTitle>{{ t('auth.signup.verification.title') }}</AlertTitle>
      <AlertDescription class="mt-2">
        <p class="mb-2">
          {{ t('auth.signup.verification.sent') }} <strong>{{ verificationEmail }}</strong>.
        </p>
        <p class="text-sm text-muted-foreground">
          {{ t('auth.signup.verification.checkSpam') }}
          {{ t('auth.signup.verification.spamInstruction') }}
          <Button
            variant="link"
            @click="showResendDialog = true" 
          >
            {{ t('actions.tryAgain') }}
          </Button>
        </p>
      </AlertDescription>
    </Alert>
    
    <ResendVerificationDialog
      :is-open="showResendDialog"
      :email="verificationEmail"
      @close="showResendDialog = false"
    />
  </div>

      <!-- Registration form -->
    <div v-else :class="cn('flex flex-col gap-4', className)">
      <!-- Display error message -->
    <FormError v-if="errorMessage" :message="errorMessage" :code="errorCode" />
    
    <form @submit="onSubmit" class="flex flex-col gap-4">
      <div class="grid gap-6">
        <!-- Name input -->
        <div class="grid gap-2">
          <Label for="name">{{ t('auth.signup.name') }}</Label>
          <div class="relative">
            <Input
              id="name"
              v-bind="nameAttrs"
              v-model="name"
              type="text"
              :placeholder="t('auth.signup.namePlaceholder')"
              :class="cn(errors.name && 'border-destructive')"
              :aria-invalid="errors.name ? 'true' : 'false'"
              autocomplete="name"
            />
            <span v-if="errors.name" class="text-destructive text-xs absolute -bottom-5 left-0">
              {{ errors.name }}
            </span>
          </div>
        </div>

                  <!-- Email input -->
        <div class="grid gap-2">
          <Label for="email">{{ t('auth.signup.email') }}</Label>
          <div class="relative">
            <Input
              id="email"
              v-bind="emailAttrs"
              v-model="email"
              type="email"
              :placeholder="t('auth.signup.emailPlaceholder')"
              :class="cn(errors.email && 'border-destructive')"
              :aria-invalid="errors.email ? 'true' : 'false'"
              autocomplete="email"
            />
            <span v-if="errors.email" class="text-destructive text-xs absolute -bottom-5 left-0">
              {{ errors.email }}
            </span>
          </div>
        </div>

                  <!-- Password input -->
        <div class="grid gap-2">
          <Label for="password">{{ t('auth.signup.password') }}</Label>
          <div class="relative">
            <Input
              id="password"
              v-bind="passwordAttrs"
              v-model="password"
              type="password"
              :placeholder="t('auth.signup.passwordPlaceholder')"
              :class="cn(errors.password && 'border-destructive')"
              :aria-invalid="errors.password ? 'true' : 'false'"
              autocomplete="new-password"
            />
            <span v-if="errors.password" class="text-destructive text-xs absolute -bottom-5 left-0">
              {{ errors.password }}
            </span>
          </div>
        </div>

                  <!-- Avatar URL input (optional) -->
        <div class="grid gap-2">
          <Label for="image">
            {{ t('auth.signup.imageUrl') }} ({{ t('auth.signup.optional') }})
          </Label>
          <div class="relative">
            <Input
              id="image"
              v-bind="imageAttrs"
              v-model="image"
              type="url"
              :placeholder="t('auth.signup.imageUrlPlaceholder')"
              :class="cn(errors.image && 'border-destructive')"
              :aria-invalid="errors.image ? 'true' : 'false'"
            />
            <span v-if="errors.image" class="text-destructive text-xs absolute -bottom-5 left-0">
              {{ errors.image }}
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
          class="w-full" 
          :disabled="loading || isSubmitting || (captchaEnabled && !turnstileToken)"
        >
          {{ loading ? t('auth.signup.submitting') : t('auth.signup.submit') }}
        </Button>
      </div>

      <!-- Login link -->
      <div class="text-center text-sm">
        {{ t('auth.signup.haveAccount') }}
        <NuxtLink :to="localePath('/signin')" class="text-primary hover:underline underline-offset-4">
          {{ t('auth.signup.signinLink') }}
        </NuxtLink>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { useForm } from 'vee-validate'
import { createValidators } from '@libs/validators'
import { authClientVue } from '@libs/auth/authClient'
import { cn } from '@/lib/utils'
import VueTurnstile from 'vue-turnstile'
import { Inbox } from 'lucide-vue-next'
import { config } from '@config'

interface Props {
  className?: string
}

const props = withDefaults(defineProps<Props>(), {
  className: ''
})

// Initialize internationalization and navigation
const { t } = useI18n()
const localePath = useLocalePath()
const { locale } = useI18n()
const route = useRoute()

// State management
const loading = ref(false)
const errorMessage = ref('')
const errorCode = ref('')
const isVerificationEmailSent = ref(false)
const verificationEmail = ref('')
const showResendDialog = ref(false)

// Get runtime configuration
const runtimeConfig = useRuntimeConfig()

// Auth configuration - directly from config
const requireEmailVerification = config.auth.requireEmailVerification

// Captcha related state
const captchaEnabled = computed(() => {
  return runtimeConfig.public.captchaEnabled !== 'false'
})

const captchaSiteKey = computed(() => {
  const siteKey = runtimeConfig.public.turnstileSiteKey as string | undefined
  return siteKey || '1x00000000000000000000AA'
})

const turnstileToken = ref('')
const turnstileError = ref('')
const turnstileRef = ref()
const turnstileKey = ref(0) // Force re-render Turnstile

// Theme detection (simplified version)
const isDark = ref(false)

// Turnstile event handlers
const onTurnstileError = () => {
  turnstileError.value = t('auth.signup.errors.captchaError')
  turnstileToken.value = ''
}

const onTurnstileExpired = () => {
  turnstileError.value = t('auth.signup.errors.captchaExpired')
  turnstileToken.value = ''
}

// Create internationalized validators
const { signupFormSchema } = createValidators(t)

// Form validation
const { handleSubmit, errors, defineField, isSubmitting } = useForm({
  validationSchema: signupFormSchema,
  initialValues: {
    name: '',
    email: '',
    password: '',
    image: ''
  }
})

// Define form fields
const [name, nameAttrs] = defineField('name', {
  validateOnBlur: true
})
const [email, emailAttrs] = defineField('email', {
  validateOnBlur: true
})
const [password, passwordAttrs] = defineField('password', {
  validateOnBlur: true  
})
const [image, imageAttrs] = defineField('image', {
  validateOnBlur: true
})

// Handle form submission
const onSubmit = handleSubmit(async (values) => {
  // Validate captcha (if enabled)
  if (captchaEnabled.value && !turnstileToken.value) {
    errorMessage.value = t('auth.signup.errors.captchaRequired')
    return
  }

  loading.value = true
  errorMessage.value = ''
  errorCode.value = ''
  turnstileError.value = ''

  try {
    const fetchOptions: any = {}
    
    // If captcha is enabled, add captcha token to request headers
    if (captchaEnabled.value && turnstileToken.value) {
      fetchOptions.headers = {
        'x-captcha-response': turnstileToken.value
      }
    }

    const result = await authClientVue.signUp.email(
      {
        email: values.email,
        password: values.password,
        name: values.name,
        image: values.image || undefined,
      },
      fetchOptions
    )

    // Check for errors
    if (result && 'error' in result && result.error) {
      const error = result.error
      if (error.code) {
        // Use internationalized error messages
        const authErrorMessage = t('auth.authErrors.' + error.code) || t('auth.authErrors.UNKNOWN_ERROR')
        errorMessage.value = authErrorMessage
        errorCode.value = error.code
      } else {
        errorMessage.value = t('common.unexpectedError')
        errorCode.value = 'UNKNOWN_ERROR'
      }
      
      // If validation fails, reset turnstile token and force re-render
      if (captchaEnabled.value) {
        turnstileToken.value = ''
        turnstileKey.value += 1
      }
      
      loading.value = false
      return
    }

    console.log('Sign up successful', result)
    
    // Check if email verification is required
    if (requireEmailVerification) {
      // Show email verification prompt
      verificationEmail.value = values.email
      isVerificationEmailSent.value = true
    } else {
      // Redirect after successful signup, check for returnTo parameter
      const returnTo = route.query.returnTo as string
      if (returnTo) {
        // Redirect to the original page
        await navigateTo(returnTo)
      } else {
        // Default redirect to home page
        await navigateTo(localePath('/'))
      }
    }
    
    loading.value = false
  } catch (err) {
    errorMessage.value = t('common.unexpectedError')
    errorCode.value = 'UNEXPECTED_ERROR'
    loading.value = false
  }
})
</script> 