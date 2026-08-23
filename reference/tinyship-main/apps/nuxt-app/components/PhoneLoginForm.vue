<template>
  <div :class="cn('flex flex-col gap-4', className)">
    <!-- Phone number input form -->
    <form v-if="!otpSent" @submit="onSubmitPhone" class="grid gap-4">
      <div class="grid gap-2">
        <Label for="phone">{{ t('auth.phone.phoneNumber') }}</Label>
        <div class="flex gap-2">
          <!-- Country code selector -->
          <CountrySelect
            v-model="countryCode"
            :disabled="loading"
          />
          <!-- Phone number input -->
          <Input
            id="phone"
            v-bind="phoneAttrs"
            v-model="phone"
            type="tel"
            :placeholder="t('auth.phone.phoneNumberPlaceholder')"
            autocapitalize="none"
            autocomplete="tel"
            autocorrect="off"
            :disabled="loading"
            class="flex-1"
            :class="cn(errors.phone && 'border-destructive')"
          />
        </div>
        <!-- Validation errors -->
        <span v-if="errors.countryCode" class="px-1 text-xs text-red-600">
          {{ errors.countryCode }}
        </span>
        <span v-if="errors.phone" class="px-1 text-xs text-red-600">
          {{ errors.phone }}
        </span>
      </div>

      <!-- Captcha component (if enabled) -->
      <div v-if="captchaEnabled" class="grid gap-2">
        <VueTurnstile
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
        {{ loading ? t('auth.phone.sendingCode') : t('actions.sendCode') }}
      </Button>
    </form>

    <!-- OTP verification form -->
    <form v-else @submit.prevent="onVerifyOTP" class="grid gap-6">
      <div class="text-center space-y-2">
        <h3 class="text-lg font-semibold">{{ t('auth.phone.enterCode') }}</h3>
        <p class="text-sm text-muted-foreground">
          {{ t('auth.phone.codeSentTo') }} {{ countryCode }} {{ phone }}
        </p>
      </div>

      <div class="space-y-2">
        <!-- OTP Input using PinInput component -->
        <div class="flex justify-center">
          <PinInput
            v-model="otpArray"
            :length="6"
            :disabled="loading"
            class="gap-2"
          >
          <PinInputGroup>
        <PinInputSlot
          v-for="(id, index) in 6"
          :key="id"
          :index="index"
        />
      </PinInputGroup>

          </PinInput>
        </div>
        
        <div class="text-center">
          <p v-if="countdown > 0" class="text-sm text-muted-foreground">
            {{ t('auth.phone.resendIn') }} {{ countdown }} {{ t('auth.phone.seconds') }}
          </p>
          <Button
            v-else
            type="button"
            variant="link"
            class="text-sm"
            @click="onResendOTP"
            :disabled="loading"
          >
            {{ t('auth.phone.resendCode') }}
          </Button>
        </div>
      </div>

      <div class="flex gap-3">
        <Button 
          type="button"
          variant="outline"
          class="flex-1"
          @click="goBack"
          :disabled="loading"
        >
          {{ t('actions.back') }}
        </Button>
        <Button 
          type="submit"
          class="flex-1"
          :disabled="loading || otpString.length !== 6"
        >
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          {{ loading ? t('auth.phone.verifying') : t('actions.verify') }}
        </Button>
      </div>
    </form>

    <!-- Error display -->
    <FormError v-if="error" :message="error.message" :code="error.code" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useForm } from 'vee-validate'
import { createValidators } from '@libs/validators'
import { authClientVue } from '@libs/auth/authClient'
import { cn } from '@/lib/utils'
import VueTurnstile from 'vue-turnstile'
import { Loader2 } from 'lucide-vue-next'
import { PinInput, PinInputSlot } from '@/components/ui/pin-input'

interface Props {
  className?: string
}

const props = withDefaults(defineProps<Props>(), {
  className: ''
})

// Initialize internationalization and navigation
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const localePath = useLocalePath()
const { locale } = useI18n()

// State management
const loading = ref(false)
const error = ref<{ code?: string; message: string } | null>(null)
const otpSent = ref(false)
const otp = ref('')
const otpArray = ref<string[]>([])
const turnstileToken = ref('')
const turnstileError = ref('')
const turnstileRef = ref()
const countdown = ref(0)

// Get runtime configuration
const runtimeConfig = useRuntimeConfig()

// Captcha related state
const captchaEnabled = computed(() => {
  // Use environment variable or default to true
  return runtimeConfig.public.captchaEnabled !== 'false'
})

const captchaSiteKey = computed(() => {
  // Use Nuxt's public environment variables
  const siteKey = runtimeConfig.public.turnstileSiteKey as string | undefined
  return siteKey || '1x00000000000000000000AA' // Test key
})

// Theme detection (simplified version)
const isDark = ref(false)

// Computed OTP string from array
const otpString = computed(() => otpArray.value.join(''))

// Watch otpArray changes to update otp ref
watch(otpArray, (newValue) => {
  otp.value = newValue.join('')
}, { deep: true })

// Turnstile event handlers
const onTurnstileError = () => {
  turnstileError.value = t('auth.signin.captchaError')
  turnstileToken.value = ''
}

const onTurnstileExpired = () => {
  turnstileError.value = t('auth.signin.captchaExpired')
  turnstileToken.value = ''
}

// Create internationalized validators
const { phoneLoginSchema } = createValidators(t)

// Form validation
const { handleSubmit, errors, defineField } = useForm({
  validationSchema: phoneLoginSchema,
  validateOnMount: false,
  initialValues: {
    countryCode: '+86', // Default to China
    phone: ''
  }
})

// Define form fields
const [countryCode] = defineField('countryCode', {
  validateOnBlur: true,
  validateOnModelUpdate: false
})
const [phone, phoneAttrs] = defineField('phone', {
  validateOnBlur: true,
  validateOnModelUpdate: false
})

// Countdown effect
watch(countdown, (newValue) => {
  if (newValue > 0) {
    setTimeout(() => {
      countdown.value = newValue - 1
    }, 1000)
  }
})

// Build complete phone number for SMS
const getFullPhoneNumber = (countryCode: string, phone: string): string => {
  return countryCode + phone
}

// Handle phone form submission
const onSubmitPhone = handleSubmit(async (values) => {
  // If captcha is enabled but no token, prompt user
  if (captchaEnabled.value && !turnstileToken.value) {
    error.value = {
      code: "CAPTCHA_REQUIRED",
      message: t('auth.phone.errors.captchaRequired'),
    }
    return
  }

  try {
    loading.value = true
    error.value = null
    
    const fullPhoneNumber = getFullPhoneNumber(values.countryCode, values.phone)
    console.log('Sending OTP to:', fullPhoneNumber)
    
    const { data: result, error: authError } = await authClientVue.phoneNumber.sendOtp({
      phoneNumber: fullPhoneNumber,
      ...(captchaEnabled.value && turnstileToken.value ? {
        fetchOptions: {
          headers: {
            "x-captcha-response": turnstileToken.value,
          },
        }
      } : {})
    })
    
    if (authError) {
      console.error('sendOtp error:', authError)
      if (authError.code) {
        // Use internationalized error messages
        const authErrorMessage = t('auth.authErrors.' + authError.code) || t('auth.authErrors.UNKNOWN_ERROR')
        error.value = {
          code: authError.code,
          message: authErrorMessage,
        }
      } else {
        error.value = {
          code: "SMS_SEND_ERROR",
          message: t('auth.authErrors.UNKNOWN_ERROR'),
        }
      }
      // Reset turnstile token if verification failed
      if (captchaEnabled.value) {
        turnstileToken.value = ''
        // Force re-render Turnstile component
        if (turnstileRef.value) {
          turnstileRef.value.reset()
        }
      }
      return
    }
    
    console.log('OTP sent successfully')
    otpSent.value = true
    countdown.value = 30 // Start 30-second countdown
  } catch (err: any) {
    console.error('Send OTP exception:', err)
    error.value = {
      code: err.code || "SMS_SEND_ERROR",
      message: err.message || t('common.unexpectedError'),
    }
    // Reset turnstile token if verification failed
    if (captchaEnabled.value) {
      turnstileToken.value = ''
      if (turnstileRef.value) {
        turnstileRef.value.reset()
      }
    }
  } finally {
    loading.value = false
  }
})

// Handle OTP verification
const onVerifyOTP = async () => {
  if (otpString.value.length !== 6) return
  
  loading.value = true
  error.value = null
  
  const fullPhoneNumber = getFullPhoneNumber(countryCode.value || '+86', phone.value || '')
  
  const { data, error: verifyError } = await authClientVue.phoneNumber.verify({
    phoneNumber: fullPhoneNumber,
    code: otpString.value
  })
  
  if (verifyError) {
    if (verifyError.code) {
      // Use internationalized error messages
      const authErrorMessage = t('auth.authErrors.' + verifyError.code) || t('auth.authErrors.UNKNOWN_ERROR')
      error.value = {
        code: verifyError.code,
        message: authErrorMessage,
      }
    } else {
      error.value = {
        code: "UNKNOWN_ERROR",
        message: t('auth.authErrors.UNKNOWN_ERROR'),
      }
    }
    loading.value = false
    return
  }
  
  console.log('isVerified', data)
  if (data) {
    // Login successful, check for returnTo parameter and redirect
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
}

// Resend OTP
const onResendOTP = async () => {
  if (countdown.value > 0 || loading.value) return
  
  try {
    loading.value = true
    error.value = null
    
    const fullPhoneNumber = getFullPhoneNumber(countryCode.value || '+86', phone.value || '')
    console.log('Resending OTP to:', fullPhoneNumber)
    
    const { data: result, error: authError } = await authClientVue.phoneNumber.sendOtp({
      phoneNumber: fullPhoneNumber,
      ...(captchaEnabled.value && turnstileToken.value ? {
        fetchOptions: {
          headers: {
            "x-captcha-response": turnstileToken.value,
          },
        }
      } : {})
    })
    
    if (authError) {
      console.error('Resend OTP error:', authError)
      if (authError.code) {
        // Use internationalized error messages
        const authErrorMessage = t('auth.authErrors.' + authError.code) || t('auth.authErrors.UNKNOWN_ERROR')
        error.value = {
          code: authError.code,
          message: authErrorMessage,
        }
      } else {
        error.value = {
          code: "SMS_SEND_ERROR",
          message: t('auth.authErrors.UNKNOWN_ERROR'),
        }
      }
      return
    }
    
    console.log('OTP resent successfully')
    countdown.value = 30 // Restart 30-second countdown
    otpArray.value = [] // Clear previous OTP input
  } catch (err: any) {
    console.error('Resend OTP exception:', err)
    error.value = {
      code: err.code || "SMS_SEND_ERROR",
      message: err.message || t('common.unexpectedError'),
    }
  } finally {
    loading.value = false
  }
}

// Go back to phone input
const goBack = () => {
  otpSent.value = false
  otpArray.value = []
  countdown.value = 0
  error.value = null
}
</script> 