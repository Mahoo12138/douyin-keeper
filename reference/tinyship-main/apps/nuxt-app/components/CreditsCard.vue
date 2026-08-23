<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Coins class="h-5 w-5 text-primary" />
        {{ t('dashboard.credits.title') }}
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
      
      <template v-else>
        <!-- Stats - 3 columns in a row -->
        <div class="grid grid-cols-3 gap-4">
          <div class="p-4 bg-muted/50 rounded-lg text-center">
            <div class="flex items-center justify-center gap-2 mb-1">
              <Coins class="h-4 w-4 text-primary" />
              <span class="text-sm font-medium text-muted-foreground">
                {{ t('dashboard.credits.available') }}
              </span>
            </div>
            <p class="text-2xl font-bold text-foreground">
              {{ creditData?.credits.balance.toLocaleString() || 0 }}
            </p>
          </div>
          <div class="p-4 bg-muted/50 rounded-lg text-center">
            <div class="flex items-center justify-center gap-2 mb-1">
              <TrendingUp class="h-4 w-4 text-muted-foreground" />
              <span class="text-sm font-medium text-muted-foreground">
                {{ t('dashboard.credits.totalPurchased') }}
              </span>
            </div>
            <p class="text-2xl font-bold text-foreground">
              {{ creditData?.credits.totalPurchased.toLocaleString() || 0 }}
            </p>
          </div>
          <div class="p-4 bg-muted/50 rounded-lg text-center">
            <div class="flex items-center justify-center gap-2 mb-1">
              <TrendingDown class="h-4 w-4 text-muted-foreground" />
              <span class="text-sm font-medium text-muted-foreground">
                {{ t('dashboard.credits.totalConsumed') }}
              </span>
            </div>
            <p class="text-2xl font-bold text-foreground">
              {{ creditData?.credits.totalConsumed.toLocaleString() || 0 }}
            </p>
          </div>
        </div>

        <!-- Transactions Table -->
        <div v-if="transactions.length > 0">
          <h4 class="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <History class="h-4 w-4" />
            {{ t('dashboard.credits.recentTransactions') }}
          </h4>
          <div class="rounded-md border">
            <table class="w-full table-fixed">
              <thead class="bg-muted">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase w-[90px]">
                    {{ t('dashboard.credits.table.type') }}
                  </th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                    {{ t('dashboard.credits.table.description') }}
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase w-[80px]">
                    {{ t('dashboard.credits.table.amount') }}
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase w-[120px]">
                    {{ t('dashboard.credits.table.time') }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr 
                  v-for="tx in transactions" 
                  :key="tx.id"
                  class="hover:bg-muted/50"
                  :class="{ 'opacity-50': loadingTransactions }"
                >
                  <td class="px-3 py-3">
                    <Badge :variant="getTransactionTypeInfo(tx.type).variant" class="text-xs">
                      <component 
                        :is="getTransactionTypeInfo(tx.type).icon" 
                        class="h-3 w-3 mr-1"
                      />
                      {{ getTransactionTypeInfo(tx.type).label }}
                    </Badge>
                  </td>
                  <td class="px-3 py-3 text-sm text-foreground truncate">
                    {{ getDescriptionDisplay(tx.description) }}
                  </td>
                  <td :class="['px-3 py-3 text-sm font-medium text-right', parseFloat(tx.amount) >= 0 ? 'text-foreground' : 'text-muted-foreground']">
                    {{ parseFloat(tx.amount) >= 0 ? '+' : '' }}{{ parseFloat(tx.amount).toLocaleString() }}
                  </td>
                  <td class="px-3 py-3 text-sm text-muted-foreground text-right whitespace-nowrap">
                    {{ formatDate(tx.createdAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="mt-4">
            <Pagination :total="totalTransactions" :items-per-page="PAGE_SIZE" :page="currentPage">
              <PaginationContent class="justify-center gap-2">
                <PaginationPrevious 
                  :disabled="currentPage <= 1 || loadingTransactions"
                  @click="handlePageChange(currentPage - 1)"
                />
                <span class="flex items-center px-3 text-sm text-muted-foreground">
                  {{ currentPage }} / {{ totalPages }}
                </span>
                <PaginationNext 
                  :disabled="currentPage >= totalPages || loadingTransactions"
                  @click="handlePageChange(currentPage + 1)"
                />
              </PaginationContent>
            </Pagination>
          </div>
        </div>

        <!-- Buy More Credits Button -->
        <NuxtLink :to="localePath('/pricing')">
          <Button class="w-full">
            <Coins class="h-4 w-4 mr-2" />
            {{ t('dashboard.credits.buyMore') }}
            <ArrowRight class="h-4 w-4 ml-2" />
          </Button>
        </NuxtLink>
      </template>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Coins, TrendingUp, TrendingDown, History, ArrowRight, Loader2, Gift, RotateCcw } from 'lucide-vue-next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Pagination,
  PaginationContent,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

const { t, locale } = useI18n()
const localePath = useLocalePath()

interface CreditStatus {
  credits: {
    balance: number
    totalPurchased: number
    totalConsumed: number
  }
  hasSubscription: boolean
  canAccess: boolean
}

interface CreditTransaction {
  id: string
  type: string
  amount: string
  balance: string
  description: string | null
  createdAt: string
}

const PAGE_SIZE = 10

const loading = ref(true)
const loadingTransactions = ref(false)
const creditData = ref<CreditStatus | null>(null)
const transactions = ref<CreditTransaction[]>([])
const currentPage = ref(1)
const totalPages = ref(1)
const totalTransactions = ref(0)

// Fetch transactions for a specific page
const fetchTransactions = async (page: number) => {
  loadingTransactions.value = true
  try {
    const response = await $fetch<{
      transactions: CreditTransaction[]
      total: number
      page: number
      totalPages: number
    }>('/api/credits/transactions', { 
      query: { page, limit: PAGE_SIZE } 
    })
    
    transactions.value = response.transactions || []
    totalPages.value = response.totalPages || 1
    totalTransactions.value = response.total || 0
    currentPage.value = response.page || 1
  } catch (error) {
    console.error('Failed to fetch transactions:', error)
  } finally {
    loadingTransactions.value = false
  }
}

const handlePageChange = async (page: number) => {
  if (page >= 1 && page <= totalPages.value && page !== currentPage.value) {
    await fetchTransactions(page)
  }
}

// Format date
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Get transaction type display info
const getTransactionTypeInfo = (type: string) => {
  const typeMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof TrendingUp }> = {
    purchase: { 
      label: t('dashboard.credits.types.purchase'), 
      variant: 'default',
      icon: TrendingUp
    },
    bonus: { 
      label: t('dashboard.credits.types.bonus'), 
      variant: 'secondary',
      icon: Gift
    },
    consumption: { 
      label: t('dashboard.credits.types.consumption'), 
      variant: 'outline',
      icon: TrendingDown
    },
    refund: { 
      label: t('dashboard.credits.types.refund'), 
      variant: 'secondary',
      icon: RotateCcw
    },
    adjustment: { 
      label: t('dashboard.credits.types.adjustment'), 
      variant: 'secondary',
      icon: History
    }
  }
  return typeMap[type] || { 
    label: type, 
    variant: 'outline' as const,
    icon: History
  }
}

// Get translated description for type codes
const getDescriptionDisplay = (description: string | null) => {
  if (!description) return '-'
  
  // Check if it's a known type code and translate it
  const descriptionKey = `dashboard.credits.descriptions.${description}`
  const translated = t(descriptionKey)
  
  // If translation exists (not same as key), use it; otherwise return original
  if (translated !== descriptionKey) {
    return translated
  }
  
  // Return as-is if not a known code (legacy data)
  return description
}

// Fetch credit data
onMounted(async () => {
  try {
    // Fetch status and first page of transactions
    const [statusResponse] = await Promise.all([
      $fetch('/api/credits/status'),
      fetchTransactions(1)
    ])
    
    creditData.value = statusResponse as CreditStatus
  } catch (error) {
    console.error('Failed to fetch credit data:', error)
  } finally {
    loading.value = false
  }
})
</script>
