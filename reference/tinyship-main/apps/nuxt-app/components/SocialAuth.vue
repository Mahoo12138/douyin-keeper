<template>
  <div :class="cn('grid grid-cols-2 gap-3', className)">
    <SocialButton 
      v-for="provider in providers" 
      :key="provider" 
      :provider="provider"
      :loading="loadingProvider === provider"
      :disabled="loadingProvider !== null && loadingProvider !== provider"
      @click="handleProviderClick(provider)"
    />
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils'
import { authClientVue } from '@libs/auth/authClient'
import type { SocialProvider } from '@/types/auth'
import { toast } from 'vue-sonner'

// Composables
const { t } = useI18n()
const route = useRoute()

interface Props {
  className?: string
  providers?: SocialProvider[]
}

const props = withDefaults(defineProps<Props>(), {
  className: '',
  providers: () => ['google', 'github', 'wechat', 'phone']
})

// Navigation
const localePath = useLocalePath()

// Loading state
const loadingProvider = ref<SocialProvider | null>(null)

// Handle provider click
const handleProviderClick = async (provider: SocialProvider) => {
  // Prevent multiple simultaneous requests
  if (loadingProvider.value) return

  // Get returnTo parameter from current route
  const returnTo = route.query.returnTo as string

  switch (provider) {
    case 'wechat':
      // Navigate to wechat login page with returnTo query parameter
      await navigateTo({
        path: localePath('/wechat'),
        query: returnTo ? { returnTo } : undefined
      })
      break
    case 'phone':
      // Navigate to phone login page with returnTo query parameter
      await navigateTo({
        path: localePath('/cellphone'),
        query: returnTo ? { returnTo } : undefined
      })
      break
    default:
      // Set loading state for the clicked provider
      loadingProvider.value = provider
      
      try {
        // Other providers use default social login flow
        // Pass callbackURL with returnTo parameter
        const callbackURL = returnTo ? `${window.location.origin}${returnTo}` : undefined
        const { data, error } = await authClientVue.signIn.social({
          provider,
          ...(callbackURL && { callbackURL })
        })
        
        if (error) {
          console.error('Social login error:', error)
          toast.error(error.message || t('common.unexpectedError'))
        }
      } finally {
        loadingProvider.value = null
      }
  }
}
</script> 