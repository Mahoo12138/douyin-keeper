<template>
  <Dialog :open="isOpen" @update:open="onClose">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ $t('auth.signin.errors.emailNotVerified.dialogTitle') }}</DialogTitle>
        <DialogDescription>
          {{ $t('auth.signin.errors.emailNotVerified.dialogDescription') }}
        </DialogDescription>
      </DialogHeader>
      
      <div class="space-y-4">
        <div class="space-y-2">
          <Label for="email">{{ $t('auth.signin.errors.emailNotVerified.emailLabel') }}</Label>
          <Input
            id="email"
            :model-value="email"
            disabled
            class="bg-muted"
          />
        </div>

        <!-- Cloudflare Turnstile 验证码 -->
        <VueTurnstile
          v-if="captchaEnabled"
          :key="turnstileKey"
          v-model="turnstileToken"
          :site-key="captchaSiteKey"
          :theme="isDark ? 'dark' : 'light'"
          @success="onTurnstileSuccess"
          @error="onTurnstileError"
          @expire="onTurnstileExpire"
        />

        <div class="flex justify-between items-center">
          <Button
            :disabled="!canSend || loading"
            class="flex-1"
            @click="handleSubmit"
          >
            {{
              loading ? $t('auth.signin.errors.emailNotVerified.sendingButton') : 
              countdown > 0 ? $t('auth.signin.errors.emailNotVerified.waitButton', { seconds: countdown }) : 
              $t('auth.signin.errors.emailNotVerified.sendButton')
            }}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { authClientVue } from '@libs/auth/authClient'
import VueTurnstile from 'vue-turnstile'
import { toast } from 'vue-sonner'

interface Props {
  isOpen: boolean
  email: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

// 国际化和导航
const { t } = useI18n()
const { locale } = useI18n()

// 状态管理
const loading = ref(false)
const turnstileToken = ref('')
const turnstileKey = ref(0)
const countdown = ref(0)

// 获取运行时配置
const runtimeConfig = useRuntimeConfig()

// Captcha 相关状态
const captchaEnabled = computed(() => {
  return runtimeConfig.public.captchaEnabled !== 'false'
})

const captchaSiteKey = computed(() => {
  const siteKey = runtimeConfig.public.turnstileSiteKey as string | undefined
  return siteKey || '1x00000000000000000000AA' // 测试 key
})

// 主题检测
const isDark = ref(false)

// 检查是否可以发送
const canSend = computed(() => 
  countdown.value === 0 && (!captchaEnabled.value || turnstileToken.value)
)

// 倒计时逻辑
let timer: NodeJS.Timeout | null = null

watch(countdown, (newVal) => {
  if (timer) clearTimeout(timer)
  
  if (newVal > 0) {
    timer = setTimeout(() => {
      countdown.value--
    }, 1000)
  }
})

// Turnstile 事件处理
const onTurnstileSuccess = (token: string) => {
  turnstileToken.value = token
}

const onTurnstileError = () => {
  turnstileToken.value = ''
}

const onTurnstileExpire = () => {
  turnstileToken.value = ''
}

// 提交处理
const handleSubmit = async () => {
  if (!canSend.value) return

  loading.value = true
  
  const fetchOptions: any = {}
  
  fetchOptions.headers = {
    'x-resend-source': 'user-initiated', // 标识这是用户主动重发请求
    ...(captchaEnabled.value && turnstileToken.value ? {
      'x-captcha-response': turnstileToken.value
    } : {})
  }

  const result = await authClientVue.sendVerificationEmail({
    email: props.email,
    callbackURL: `/${locale.value}`,
    fetchOptions
  })

  // Handle the result - check for error property in the response
  const error = 'error' in result ? result.error : null

  if (error) {
    console.error('Failed to resend verification email:', error)
    toast.error(error.message || t('auth.signin.errors.emailNotVerified.resendError'))
    
    // 重置 turnstile
    if (captchaEnabled.value) {
      turnstileToken.value = ''
      turnstileKey.value++
    }
    loading.value = false
    return
  }

  toast.success(t('auth.signin.errors.emailNotVerified.resendSuccess'))
  countdown.value = 60 // 开始60秒倒计时
  turnstileToken.value = ''
  turnstileKey.value++ // 重置 turnstile
  onClose()
  loading.value = false
}

const onClose = () => {
  emit('close')
}

// 清理定时器
onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script> 