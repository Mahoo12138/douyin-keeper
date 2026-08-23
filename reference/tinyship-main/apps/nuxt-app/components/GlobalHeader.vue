<template>
  <header class="w-full bg-background/90 backdrop-blur-sm border-b border-border sticky top-0 z-40">
    <div class="container mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex h-16 items-center justify-between">
        <!-- Logo and brand -->
        <div class="flex items-center">
          <NuxtLink :to="localePath('/')">
            <AppLogo size="lg" />
          </NuxtLink>
        </div>

        <!-- Desktop navigation -->
        <nav class="hidden md:flex md:items-center md:space-x-8">
          <!-- Demos Dropdown -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button class="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                {{ t('header.navigation.demos') }}
                <ChevronDown class="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" class="w-96 p-4">
              <div class="space-y-1">
                <DropdownMenuItem as-child class="p-0">
                  <NuxtLink :to="localePath('/ai')" class="group flex items-start gap-4 rounded-lg p-3 hover:bg-muted/50 transition-colors">
                    <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-primary-foreground">
                      <Bot class="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div class="flex flex-col">
                      <span class="font-semibold text-sm">{{ t('header.demos.ai.title') }}</span>
                      <span class="text-sm text-muted-foreground leading-snug mt-0.5">
                        {{ t('header.demos.ai.description') }}
                      </span>
                    </div>
                  </NuxtLink>
                </DropdownMenuItem>
                <DropdownMenuItem as-child class="p-0">
                  <NuxtLink :to="localePath('/image-generate')" class="group flex items-start gap-4 rounded-lg p-3 hover:bg-muted/50 transition-colors">
                    <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-primary-foreground">
                      <ImageIcon class="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div class="flex flex-col">
                      <span class="font-semibold text-sm">{{ t('header.demos.aiImage.title') }}</span>
                      <span class="text-sm text-muted-foreground leading-snug mt-0.5">
                        {{ t('header.demos.aiImage.description') }}
                      </span>
                    </div>
                  </NuxtLink>
                </DropdownMenuItem>
                <DropdownMenuItem as-child class="p-0">
                  <NuxtLink :to="localePath('/video-generate')" class="group flex items-start gap-4 rounded-lg p-3 hover:bg-muted/50 transition-colors">
                    <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-primary-foreground">
                      <VideoIcon class="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div class="flex flex-col">
                      <span class="font-semibold text-sm">{{ t('header.demos.aiVideo.title') }}</span>
                      <span class="text-sm text-muted-foreground leading-snug mt-0.5">
                        {{ t('header.demos.aiVideo.description') }}
                      </span>
                    </div>
                  </NuxtLink>
                </DropdownMenuItem>
                <DropdownMenuItem as-child class="p-0">
                  <NuxtLink :to="localePath('/premium-features')" class="group flex items-start gap-4 rounded-lg p-3 hover:bg-muted/50 transition-colors">
                    <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-primary-foreground">
                      <Crown class="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div class="flex flex-col">
                      <span class="font-semibold text-sm">{{ t('header.demos.premium.title') }}</span>
                      <span class="text-sm text-muted-foreground leading-snug mt-0.5">
                        {{ t('header.demos.premium.description') }}
                      </span>
                    </div>
                  </NuxtLink>
                </DropdownMenuItem>
                <DropdownMenuItem as-child class="p-0">
                  <NuxtLink :to="localePath('/upload')" class="group flex items-start gap-4 rounded-lg p-3 hover:bg-muted/50 transition-colors">
                    <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-primary-foreground">
                      <Upload class="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div class="flex flex-col">
                      <span class="font-semibold text-sm">{{ t('header.demos.upload.title') }}</span>
                      <span class="text-sm text-muted-foreground leading-snug mt-0.5">
                        {{ t('header.demos.upload.description') }}
                      </span>
                    </div>
                  </NuxtLink>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <NuxtLink 
            :to="localePath('/blog')" 
            class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {{ t('header.navigation.blog') }}
          </NuxtLink>
          <NuxtLink 
            :to="localePath('/pricing')" 
            class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {{ t('header.navigation.pricing') }}
          </NuxtLink>
        </nav>

        <!-- Right side actions -->
        <div class="hidden md:flex md:items-center md:space-x-4">
          <!-- Language switcher -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="sm" class="h-9 px-3">
                <svg class="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <span class="hidden sm:inline">
                  {{ locale === 'en' ? t('header.language.english') : t('header.language.chinese') }}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                v-for="localeOption in availableLocales" 
                :key="localeOption.code"
                @click="changeLanguage(localeOption.code)"
              >
                <span>{{ localeOption.name }}</span>
                <svg v-if="localeOption.code === locale" class="ml-auto h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <!-- Dark Mode Toggle -->
          <ThemeToggle />
          
          <!-- Color Scheme Selector -->
          <ColorSchemeSelector />

          <!-- User menu or Auth buttons -->
          <div class="flex items-center space-x-2">
            <DropdownMenu v-if="user">
              <DropdownMenuTrigger as-child>
                <button class="flex items-center space-x-2 focus:outline-none">
                  <Avatar class="h-8 w-8 border border-border">
                    <AvatarImage :src="user.image || ''" :alt="user.name || user.email || 'User'" />
                    <AvatarFallback class="bg-muted text-muted-foreground text-xs">
                      {{ (user.name?.charAt(0) || user.email?.charAt(0) || 'U').toUpperCase() }}
                    </AvatarFallback>
                  </Avatar>
                  <span class="text-sm font-medium text-foreground">{{ user.name || user.email }}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="w-56" align="end">
                <DropdownMenuLabel>
                  <div class="flex flex-col space-y-1">
                    <p class="text-sm font-medium text-foreground">{{ user.name || 'User' }}</p>
                    <p class="text-xs text-muted-foreground">{{ user.email }}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem as-child>
                    <NuxtLink :to="localePath('/dashboard')" class="flex items-center">
                      <svg class="mr-2 h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                      {{ t('header.userMenu.personalSettings') }}
                    </NuxtLink>
                  </DropdownMenuItem>
                  <DropdownMenuItem v-if="user.role === 'admin'" as-child>
                    <NuxtLink :to="localePath('/admin')" class="flex items-center">
                      <svg class="mr-2 h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 3v18h18V3H3zm16 16H5V5h14v14z"/>
                        <path d="M8 8h8m-8 4h8m-8 4h5"/>
                      </svg>
                      {{ t('header.userMenu.adminPanel') }}
                    </NuxtLink>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem class="text-destructive" @click="handleSignOut">
                  <svg class="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  {{ t('header.auth.signOut') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div v-else class="flex items-center space-x-2">
              <NuxtLink :to="localePath('/signin')">
                <Button variant="ghost" class="text-sm font-medium">
                  {{ t('header.auth.signIn') }}
                </Button>
              </NuxtLink>
              <NuxtLink :to="localePath('/signup')">
                <Button variant="default" class="text-sm font-medium rounded-full">
                  {{ t('header.auth.getStarted') }}
                </Button>
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- Mobile menu button -->
        <div class="flex md:hidden">
          <button
            @click="isMenuOpen = !isMenuOpen"
            class="inline-flex items-center justify-center p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none transition-colors"
          >
            <span class="sr-only">Open main menu</span>
            <!-- Hamburger icon -->
            <svg v-if="!isMenuOpen" class="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <svg v-else class="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile menu -->
    <div v-if="isMenuOpen" class="md:hidden bg-background border-t border-border">
      <div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
        <!-- Demos Section -->
        <div class="px-3 py-2">
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {{ t('header.navigation.demos') }}
          </p>
          <div class="space-y-1">
            <NuxtLink 
              :to="localePath('/ai')" 
              class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted"
              @click="isMenuOpen = false"
            >
              <Bot class="h-5 w-5 text-muted-foreground" />
              <div>
                <span class="block">{{ t('header.demos.ai.title') }}</span>
                <span class="block text-xs text-muted-foreground">{{ t('header.demos.ai.description') }}</span>
              </div>
            </NuxtLink>
            <NuxtLink 
              :to="localePath('/image-generate')" 
              class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted"
              @click="isMenuOpen = false"
            >
              <ImageIcon class="h-5 w-5 text-muted-foreground" />
              <div>
                <span class="block">{{ t('header.demos.aiImage.title') }}</span>
                <span class="block text-xs text-muted-foreground">{{ t('header.demos.aiImage.description') }}</span>
              </div>
            </NuxtLink>
            <NuxtLink 
              :to="localePath('/video-generate')" 
              class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted"
              @click="isMenuOpen = false"
            >
              <VideoIcon class="h-5 w-5 text-muted-foreground" />
              <div>
                <span class="block">{{ t('header.demos.aiVideo.title') }}</span>
                <span class="block text-xs text-muted-foreground">{{ t('header.demos.aiVideo.description') }}</span>
              </div>
            </NuxtLink>
            <NuxtLink 
              :to="localePath('/premium-features')" 
              class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted"
              @click="isMenuOpen = false"
            >
              <Crown class="h-5 w-5 text-muted-foreground" />
              <div>
                <span class="block">{{ t('header.demos.premium.title') }}</span>
                <span class="block text-xs text-muted-foreground">{{ t('header.demos.premium.description') }}</span>
              </div>
            </NuxtLink>
            <NuxtLink 
              :to="localePath('/upload')" 
              class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted"
              @click="isMenuOpen = false"
            >
              <Upload class="h-5 w-5 text-muted-foreground" />
              <div>
                <span class="block">{{ t('header.demos.upload.title') }}</span>
                <span class="block text-xs text-muted-foreground">{{ t('header.demos.upload.description') }}</span>
              </div>
            </NuxtLink>
          </div>
        </div>
        <div class="border-t border-border my-2" />
        <NuxtLink 
          :to="localePath('/blog')" 
          class="block px-3 py-2 rounded-md text-base font-medium text-foreground hover:text-foreground hover:bg-muted"
          @click="isMenuOpen = false"
        >
          {{ t('header.navigation.blog') }}
        </NuxtLink>
        <NuxtLink 
          :to="localePath('/pricing')" 
          class="block px-3 py-2 rounded-md text-base font-medium text-foreground hover:text-foreground hover:bg-muted"
          @click="isMenuOpen = false"
        >
          {{ t('header.navigation.pricing') }}
        </NuxtLink>
        
        <!-- Mobile Theme and Language Controls -->
        <div class="border-t border-border pt-3 mt-3 space-y-2">
          <div class="px-3 py-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-foreground">{{ t('header.mobile.languageSelection') }}</span>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="sm">
                    <svg class="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M2 12h20"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    {{ locale === 'en' ? t('header.language.english') : t('header.language.chinese') }}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    v-for="localeOption in availableLocales" 
                    :key="localeOption.code"
                    @click="changeLanguage(localeOption.code)"
                  >
                    <span>{{ localeOption.name }}</span>
                    <Check v-if="localeOption.code === locale" class="ml-auto h-4 w-4" />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
      
      <div class="pt-4 pb-3 border-t border-border">
        <div v-if="user" class="px-4 space-y-1">
          <div class="flex items-center px-3">
            <div class="flex-shrink-0">
              <Avatar class="h-10 w-10 border border-border">
                <AvatarImage :src="user.image || ''" :alt="user.name || user.email || 'User'" />
                <AvatarFallback class="bg-muted text-muted-foreground text-sm">
                  {{ (user.name?.charAt(0) || user.email?.charAt(0) || 'U').toUpperCase() }}
                </AvatarFallback>
              </Avatar>
            </div>
            <div class="ml-3">
              <div class="text-base font-medium text-foreground">{{ user.name || 'User' }}</div>
              <div class="text-sm font-medium text-muted-foreground">{{ user.email }}</div>
            </div>
          </div>
          <NuxtLink 
            :to="localePath('/dashboard')" 
            class="block px-3 py-2 rounded-md text-base font-medium text-foreground hover:text-foreground hover:bg-muted"
            @click="isMenuOpen = false"
          >
            {{ t('header.userMenu.personalSettings') }}
          </NuxtLink>
          <NuxtLink 
            v-if="user.role === 'admin'" 
            :to="localePath('/admin')" 
            class="block px-3 py-2 rounded-md text-base font-medium text-foreground hover:text-foreground hover:bg-muted"
            @click="isMenuOpen = false"
          >
            {{ t('header.userMenu.adminPanel') }}
          </NuxtLink>
          <button
            @click="handleSignOut"
            class="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-destructive hover:bg-destructive/10"
          >
            {{ t('header.auth.signOut') }}
          </button>
        </div>
        <div v-else class="flex items-center justify-center space-x-4 px-4 py-2">
          <NuxtLink :to="localePath('/signin')" class="w-1/2" @click="isMenuOpen = false">
            <Button variant="outline" class="w-full text-sm font-medium">
              {{ t('header.auth.signIn') }}
            </Button>
          </NuxtLink>
          <NuxtLink :to="localePath('/signup')" class="w-1/2" @click="isMenuOpen = false">
            <Button variant="default" class="w-full text-sm font-medium rounded-full">
              {{ t('header.auth.getStarted') }}
            </Button>
          </NuxtLink>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Check, ChevronDown, Bot, Crown, Upload, ImageIcon, VideoIcon } from 'lucide-vue-next'
// Reactive state
const isMenuOpen = ref(false)

// Internationalization - using @nuxtjs/i18n properly
const { t, locale, locales } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()

// Authentication
const { user, signOut } = useAuth()
// Available locales from i18n config  
const availableLocales = computed(() => 
  locales.value.map(localeConfig => ({
    code: localeConfig.code,
    name: localeConfig.name
  }))
)

// Language change handler
const changeLanguage = (targetLocale: string) => {
  // Use Nuxt i18n's switchLocalePath
  const path = switchLocalePath(targetLocale as any)
  if (path) {
    navigateTo(path)
  }
}

// Sign out handler
const handleSignOut = async () => {
  await signOut()
}
</script> 