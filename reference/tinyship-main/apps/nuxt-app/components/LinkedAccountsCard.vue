<script setup lang="ts">
import { authClientVue } from "@libs/auth/authClient"

const { t } = useI18n()

interface LinkedAccount {
  id: string
  providerId: string
  accountId: string
  createdAt: string | Date
}

const linkedAccounts = ref<LinkedAccount[]>([])
const loading = ref(true)

/**
 * Fetch linked accounts data from Better Auth
 */
const fetchLinkedAccounts = async () => {
  const { data, error } = await authClientVue.listAccounts()
  
  if (error) {
    console.error('Failed to fetch linked accounts:', error)
    linkedAccounts.value = []
    loading.value = false
    return
  }
  
  // 根据实际返回的数据结构设置账户列表
  if (data) {
    linkedAccounts.value = data
  } else {
    linkedAccounts.value = []
  }
  
  loading.value = false
}

/**
 * Format date according to locale
 * @param dateString - Date string or Date object
 * @returns Formatted date string
 */
const formatDate = (dateString: string | Date) => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Get provider display name from i18n
 * @param account - Account object
 * @returns Localized provider name
 */
const getProviderDisplayName = (account: LinkedAccount) => {
  const providerId = account.providerId || 'unknown'
  const providerKey = `dashboard.linkedAccounts.providers.${providerId}` as const
  return t(providerKey)
}

// Fetch data when component is mounted
onMounted(() => {
  fetchLinkedAccounts()
})
</script>

<template>
  <div>
    <h3 class="text-lg font-medium mb-4">{{ t('dashboard.linkedAccounts.title') }}</h3>
    
    <!-- Loading state -->
    <div v-if="loading" class="animate-pulse">
      <div class="h-4 bg-muted rounded w-32 mb-2"></div>
      <div class="h-4 bg-muted rounded w-48"></div>
    </div>
    
    <!-- Linked accounts list -->
    <div v-if="!loading && linkedAccounts.length > 0" class="space-y-3">
      <div 
        v-for="account in linkedAccounts" 
        :key="account.id"
        class="flex items-center justify-between p-4 border rounded-lg"
      >
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <!-- Icon can be added here -->
            <div class="w-4 h-4 bg-primary rounded-full"></div>
          </div>
          <div>
            <p class="font-medium">{{ getProviderDisplayName(account) }}</p>
            <p class="text-sm text-muted-foreground">
              {{ t('dashboard.linkedAccounts.connectedAt') }} {{ formatDate(account.createdAt) }}
            </p>
          </div>
        </div>
        <Badge variant="secondary">
          {{ t('dashboard.linkedAccounts.connected') }}
        </Badge>
      </div>
    </div>
    
    <!-- No linked accounts -->
    <div v-else-if="!loading && linkedAccounts.length === 0" class="text-center p-8 text-muted-foreground">
      <p>{{ t('dashboard.linkedAccounts.noLinkedAccounts') }}</p>
    </div>
  </div>
</template> 