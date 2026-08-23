<template>
  <div class="container flex items-center justify-center min-h-screen py-6">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1">
        <CardTitle class="text-2xl text-center">
          {{ t('auth.wechat.title') }}
        </CardTitle>
        <CardDescription class="text-center">
          {{ t('auth.wechat.description') }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid gap-6">
          <div class="relative">
            <div 
              id="login_container" 
              class="flex items-center justify-center min-h-[300px]"
            >
              <div class="text-center text-muted-foreground">
                {{ t('auth.wechat.loadingQRCode') }}
              </div>
            </div>
          </div>
          <div class="text-muted-foreground text-center text-xs text-balance [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary">
            {{ t('auth.wechat.termsNotice') }} <a href="#">{{ t('auth.wechat.termsOfService') }}</a>
            {{ t('common.and') }} <a href="#">{{ t('auth.wechat.privacyPolicy') }}</a>.
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
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, nextTick, onUnmounted } from 'vue'
import { nanoid } from 'nanoid'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Define global interface for WeChat Login
declare global {
  interface Window {
    WxLogin: any;
  }
}

// Get runtime config for WeChat configuration
const config = useRuntimeConfig()

// Get i18n composable
const { t } = useI18n()

// Get localized path function
const localePath = useLocalePath()

// Get route to retrieve returnTo parameter
const route = useRoute()

// Define layout
definePageMeta({
  layout: 'auth'
})

// Set page head with reactive translations
useHead({
  title: () => t('auth.metadata.wechat.title'),
  meta: [
    { name: 'description', content: () => t('auth.metadata.wechat.description') },
    { name: 'keywords', content: () => t('auth.metadata.wechat.keywords') }
  ]
})

// Initialize WeChat login
const initWxLogin = () => {
  if (typeof window.WxLogin !== 'undefined') {
    const returnTo = route.query.returnTo as string || '/'
    const stateData = btoa(encodeURIComponent(returnTo))
    
    new window.WxLogin({
      id: 'login_container',
      appid: config.public.wechatAppId,
      scope: 'snsapi_login',
      redirect_uri: encodeURIComponent(`${window.location.origin}/api/auth/oauth2/callback/wechat`),
      state: stateData,
      style: 'black',
                href: `${window.location.origin}/wxLogin.css`,
    });
  }
};

// Load WeChat script and initialize login
onMounted(async () => {
  // Load WeChat login script
  const script = document.createElement('script')
  script.src = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js'
  script.async = true
  
  script.onload = () => {
    // Initialize WeChat login after script loads
    nextTick(() => {
      setTimeout(initWxLogin, 1000)
    })
  }
  
  script.onerror = () => {
    console.error('Failed to load WeChat login script')
    // Show error message to user with translation
    const container = document.getElementById('login_container')
    if (container) {
      container.innerHTML = `
        <div class="text-center text-red-500">
          ${t('auth.wechat.errors.loadingFailed')}
        </div>
      `
    }
  }
  
  document.head.appendChild(script)
  
  // Cleanup script on unmount
  onUnmounted(() => {
    if (document.head.contains(script)) {
      document.head.removeChild(script)
    }
  })
})
</script> 