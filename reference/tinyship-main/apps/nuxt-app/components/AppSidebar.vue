<template>
  <Sidebar>
    <SidebarHeader class="p-4 border-b border-sidebar-border">
      <NuxtLink :to="localePath('/')">
        <AppLogo size="md" />
      </NuxtLink>
    </SidebarHeader>
    
    <SidebarContent>
      <!-- Dashboard Section -->
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isRouteActive('/admin') && route.path === localePath('/admin')">
                <NuxtLink :to="localePath('/admin')">
                  <LayoutDashboard />
                  <span>{{ t('navigation.admin.dashboard') }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      
      <!-- Main Menu Section -->
      <SidebarGroup>
        <SidebarGroupLabel>{{ t('navigation.admin.application') }}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isRouteActive('/admin/users')">
                <NuxtLink :to="localePath('/admin/users')">
                  <User />
                  <span>{{ t('navigation.admin.users') }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isRouteActive('/admin/subscriptions')">
                <NuxtLink :to="localePath('/admin/subscriptions')">
                  <CreditCard />
                  <span>{{ t('navigation.admin.subscriptions') }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isRouteActive('/admin/orders')">
                <NuxtLink :to="localePath('/admin/orders')">
                  <ShoppingCart />
                  <span>{{ t('navigation.admin.orders') }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isRouteActive('/admin/credits')">
                <NuxtLink :to="localePath('/admin/credits')">
                  <Coins />
                  <span>{{ t('navigation.admin.credits') }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isRouteActive('/admin/pricing')">
                <NuxtLink :to="localePath('/admin/pricing')">
                  <Tag />
                  <span>{{ t('navigation.admin.pricing') }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton as-child :is-active="isRouteActive('/admin/blog')">
                <NuxtLink :to="localePath('/admin/blog')">
                  <FileText />
                  <span>{{ t('navigation.admin.blog') }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <template v-if="affiliateEnabled">
              <SidebarMenuItem>
                <SidebarMenuButton as-child :is-active="isRouteActive('/admin/commissions')">
                  <NuxtLink :to="localePath('/admin/commissions')">
                    <DollarSign />
                    <span>{{ t('navigation.admin.commissions') }}</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <SidebarMenuButton as-child :is-active="isRouteActive('/admin/withdrawals')">
                  <NuxtLink :to="localePath('/admin/withdrawals')">
                    <Wallet />
                    <span>{{ t('navigation.admin.withdrawals') }}</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </template>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>

<script setup lang="ts">
import { User, CreditCard, ShoppingCart, LayoutDashboard, Coins, FileText, DollarSign, Wallet, Tag } from 'lucide-vue-next'

// Internationalization
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { public: publicConfig } = useRuntimeConfig()

// Check if a route is active
const affiliateEnabled = publicConfig.affiliateEnabled

const isRouteActive = (path: string) => {
  return route.path.startsWith(localePath(path))
}
</script>
