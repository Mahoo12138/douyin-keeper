<template>
  <Card class="w-[380px]">
    <!-- Reset success confirmation state -->
    <div v-if="resetSuccess" class="text-center space-y-4 p-6">
      <h3 class="font-medium">{{ t('auth.resetPassword.success.title') }}</h3>
      <p class="text-muted-foreground">
        {{ t('auth.resetPassword.success.description') }}
      </p>
      <Button @click="navigateTo(localePath('/signin'))">
        {{ t('auth.resetPassword.success.backToSignin') }}
      </Button>
    </div>

    <!-- Reset password form -->
    <div v-else>
      <CardHeader class="text-center">
        <CardTitle class="text-xl">{{ t('auth.resetPassword.title') }}</CardTitle>
        <CardDescription>
          {{ t('auth.resetPassword.description') }}
        </CardDescription>
      </CardHeader>
      
      <CardContent class="flex flex-col gap-6">
        <form @submit="onSubmit">
          <div class="grid gap-6">
            <!-- Password input -->
            <div class="grid gap-2">
              <Label for="password">{{ t('auth.resetPassword.password') }}</Label>
              <div class="relative">
                <Input
                  id="password"
                  v-bind="passwordAttrs"
                  v-model="password"
                  type="password"
                  :placeholder="t('auth.resetPassword.passwordPlaceholder')"
                  :class="cn(errors.password && 'border-destructive')"
                  :aria-invalid="errors.password ? 'true' : 'false'"
                  :disabled="loading"
                  autocomplete="new-password"
                />
                <span v-if="errors.password" class="text-destructive text-xs absolute -bottom-5 left-0">
                  {{ errors.password }}
                </span>
              </div>
            </div>

            <!-- Confirm password input -->
            <div class="grid gap-2">
              <Label for="confirmPassword">{{ t('auth.resetPassword.confirmPassword') }}</Label>
              <div class="relative">
                <Input
                  id="confirmPassword"
                  v-bind="confirmPasswordAttrs"
                  v-model="confirmPassword"
                  type="password"
                  :placeholder="t('auth.resetPassword.confirmPasswordPlaceholder')"
                  :class="cn(errors.confirmPassword && 'border-destructive')"
                  :aria-invalid="errors.confirmPassword ? 'true' : 'false'"
                  :disabled="loading"
                  autocomplete="new-password"
                />
                <span v-if="errors.confirmPassword" class="text-destructive text-xs absolute -bottom-5 left-0">
                  {{ errors.confirmPassword }}
                </span>
              </div>
            </div>

            <!-- Submit button -->
            <Button 
              type="submit" 
              :disabled="loading || !token"
            >
              <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
              {{ loading ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submit') }}
            </Button>
          </div>
        </form>

        <!-- Error display -->
        <FormError v-if="errorMessage" :message="errorMessage" :code="errorCode" />
      </CardContent>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { useForm } from 'vee-validate'
import { createValidators } from '@libs/validators'
import { authClientVue } from '@libs/auth/authClient'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-vue-next'

// Initialize internationalization and navigation
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

// Set layout
definePageMeta({
  layout: 'auth'
})

// Set page title and meta tags
useSeoMeta({
  title: t('auth.metadata.resetPassword.title'),
  description: t('auth.metadata.resetPassword.description'),
  keywords: t('auth.metadata.resetPassword.keywords')
})

// State management
const loading = ref(false)
const errorMessage = ref('')
const errorCode = ref('')
const resetSuccess = ref(false)
const token = ref<string | null>(null)

// Get token from URL when component mounts
onMounted(() => {
  const urlToken = route.query.token as string
  if (!urlToken) {
    errorMessage.value = t('auth.resetPassword.errors.invalidToken')
    errorCode.value = 'INVALID_TOKEN'
  } else {
    token.value = urlToken
  }
})

// Create internationalized validators
const { resetPasswordSchema } = createValidators(t)

// Form validation
const { handleSubmit, errors, defineField, isSubmitting } = useForm({
  validationSchema: resetPasswordSchema,
  initialValues: {
    password: '',
    confirmPassword: ''
  }
})

// Define form fields
const [password, passwordAttrs] = defineField('password', {
  validateOnBlur: true
})
const [confirmPassword, confirmPasswordAttrs] = defineField('confirmPassword', {
  validateOnBlur: true
})

// Handle form submission
const onSubmit = handleSubmit(async (values) => {
  if (!token.value) return

  loading.value = true
  errorMessage.value = ''
  errorCode.value = ''

  const { data, error } = await authClientVue.resetPassword({
    newPassword: values.password,
    token: token.value
  })

  if (error) {
    errorMessage.value = error.message || t('common.unexpectedError')
    errorCode.value = error.code || 'UNKNOWN_ERROR'
    loading.value = false
    return
  }

  resetSuccess.value = true
  loading.value = false
})
</script> 