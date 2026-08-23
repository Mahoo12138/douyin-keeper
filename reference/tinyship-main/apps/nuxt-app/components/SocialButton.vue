<template>
  <Button
    variant="outline"
    :class="cn('w-full bg-background hover:bg-accent hover:text-accent-foreground', className)"
    :disabled="disabled || loading"
    @click="$emit('click')"
    v-bind="$attrs"
  >
    <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
    <component v-else :is="currentIcon" class="mr-2 h-4 w-4" />
    {{ providerNames[provider] }}
  </Button>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils'
import type { SocialProvider } from '@/types/auth'
import { Loader2 } from 'lucide-vue-next'

// Import SVG icons as Vue components
import GoogleIcon from '@libs/ui/icons/google.svg'
import GithubIcon from '@libs/ui/icons/github.svg'
import AppleIcon from '@libs/ui/icons/apple.svg'
import WeChatIcon from '@libs/ui/icons/wechat.svg'
import PhoneIcon from '@libs/ui/icons/phone.svg'

interface Props {
  provider: SocialProvider
  className?: string
  loading?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  className: '',
  loading: false,
  disabled: false
})

// Define events
defineEmits<{
  click: []
}>()

// Internationalization
const { t } = useI18n()

// Create icon mapping
const providerIcons = {
  google: GoogleIcon,
  github: GithubIcon,
  apple: AppleIcon,
  wechat: WeChatIcon,
  phone: PhoneIcon,
} as const

// Get current icon component
const currentIcon = computed(() => providerIcons[props.provider])

// Create provider name mapping
const providerNames = computed(() => ({
  google: t('auth.signin.socialProviders.google'),
  github: t('auth.signin.socialProviders.github'),
  apple: t('auth.signin.socialProviders.apple'),
  wechat: t('auth.signin.socialProviders.wechat'),
  phone: t('auth.signin.socialProviders.phone'),
}))
</script> 