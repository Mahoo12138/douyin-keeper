<script setup lang="ts">
import { Copy, Check, Users, Wallet, TrendingUp, Percent, Gift, ArrowLeft, ArrowRight, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const { t } = useI18n()

interface AffiliateStats {
  referralCode: string
  referralLink: string
  commissionBalance: number
  commissionRate: number
  totalCommission: number
  totalPaidReferrals: number
  totalRegisteredReferrals: number
  currency: string
  referrerSignupBonus: number
  refereeSignupBonus: number
  minWithdrawalAmount: number
  enabled: boolean
}

interface Commission {
  id: string
  orderId: string
  orderAmount: string
  commissionRate: string
  commissionAmount: string
  currency: string
  status: string
  createdAt: string
  buyer?: { name: string | null; email: string } | null
}

interface Referral {
  id: string
  name: string | null
  email: string
  createdAt: string
}

type ViewState = 'overview' | 'referrals' | 'commissions'

const stats = ref<AffiliateStats | null>(null)
const commissions = ref<Commission[]>([])
const referrals = ref<Referral[]>([])
const loading = ref(true)
const copied = ref(false)
const view = ref<ViewState>('overview')

const statusVariantMap: Record<string, string> = {
  credited: 'default',
  pending: 'secondary',
  withdrawn: 'outline',
  cancelled: 'destructive',
}

async function fetchData() {
  try {
    const [statsRes, commissionsRes, referralsRes] = await Promise.all([
      $fetch<AffiliateStats>('/api/affiliate/stats'),
      $fetch<any>('/api/affiliate/commissions?limit=10'),
      $fetch<any>('/api/affiliate/referrals?limit=10'),
    ])
    stats.value = statsRes
    commissions.value = commissionsRes?.commissions || []
    referrals.value = referralsRes?.referrals || []
  } catch (err) {
    console.error('Failed to load affiliate data:', err)
  } finally {
    loading.value = false
  }
}

async function handleCopy() {
  if (!stats.value?.referralLink) return
  try {
    await navigator.clipboard.writeText(stats.value.referralLink)
    copied.value = true
    toast.success(t('dashboard.affiliate.copied'))
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    toast.error('Failed to copy')
  }
}

onMounted(() => fetchData())
</script>

<template>
  <!-- Loading state -->
  <Card v-if="loading">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Users class="h-5 w-5 text-primary" />
        {{ t('dashboard.affiliate.title') }}
      </CardTitle>
    </CardHeader>
    <CardContent class="flex items-center justify-center py-8">
      <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
    </CardContent>
  </Card>

  <!-- Disabled state -->
  <template v-else-if="!stats?.enabled" />

  <!-- Referrals sub-view -->
  <Card v-else-if="view === 'referrals'">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <button
          class="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted transition-colors"
          @click="view = 'overview'"
        >
          <ArrowLeft class="h-5 w-5" />
        </button>
        {{ t('dashboard.affiliate.referralsTab') }}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="referrals.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
        <Users class="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p class="text-sm text-muted-foreground">{{ t('dashboard.affiliate.noReferrals') }}</p>
      </div>
      <div v-else class="rounded-md border">
        <table class="w-full">
          <thead class="bg-muted">
            <tr>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.affiliate.table.user') }}</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.affiliate.table.email') }}</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.affiliate.table.joinDate') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="r in referrals" :key="r.id" class="hover:bg-muted/50">
              <td class="px-4 py-3 text-sm">{{ r.name || '-' }}</td>
              <td class="px-4 py-3 text-sm text-muted-foreground">{{ r.email }}</td>
              <td class="px-4 py-3 text-sm text-muted-foreground">{{ new Date(r.createdAt).toLocaleDateString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>

  <!-- Commissions sub-view -->
  <Card v-else-if="view === 'commissions'">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <button
          class="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted transition-colors"
          @click="view = 'overview'"
        >
          <ArrowLeft class="h-5 w-5" />
        </button>
        {{ t('dashboard.affiliate.commissionsTab') }}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="commissions.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
        <Wallet class="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p class="text-sm text-muted-foreground">{{ t('dashboard.affiliate.noCommissions') }}</p>
      </div>
      <div v-else class="rounded-md border overflow-x-auto">
        <table class="w-full">
          <thead class="bg-muted">
            <tr>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.affiliate.table.buyer') }}</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.affiliate.table.orderAmount') }}</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.affiliate.table.commission') }}</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.affiliate.table.status') }}</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.affiliate.table.date') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="c in commissions" :key="c.id" class="hover:bg-muted/50">
              <td class="px-4 py-3">
                <template v-if="c.buyer">
                  <div class="text-xs">
                    <div class="font-medium truncate max-w-[120px]">{{ c.buyer.name || '—' }}</div>
                    <div class="text-muted-foreground truncate max-w-[120px]">{{ c.buyer.email }}</div>
                  </div>
                </template>
                <span v-else class="text-sm text-muted-foreground">—</span>
              </td>
              <td class="px-4 py-3 text-sm">{{ c.currency }} {{ parseFloat(c.orderAmount).toFixed(2) }}</td>
              <td class="px-4 py-3 text-sm font-medium">
                {{ c.currency }} {{ parseFloat(c.commissionAmount).toFixed(2) }}
                <span class="text-muted-foreground ml-1 text-xs">({{ (parseFloat(c.commissionRate) * 100).toFixed(0) }}%)</span>
              </td>
              <td class="px-4 py-3">
                <Badge :variant="(statusVariantMap[c.status] || 'secondary') as any">
                  {{ t(`dashboard.affiliate.status.${c.status}`) }}
                </Badge>
              </td>
              <td class="px-4 py-3 text-sm text-muted-foreground">{{ new Date(c.createdAt).toLocaleDateString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>

  <!-- Overview (default) -->
  <Card v-else>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Users class="h-5 w-5 text-primary" />
        {{ t('dashboard.affiliate.title') }}
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-6">
      <!-- Stats overview -->
      <div class="grid grid-cols-2 gap-4">
        <div class="p-4 bg-muted/50 rounded-lg text-center">
          <div class="flex items-center justify-center gap-2 mb-1">
            <Wallet class="h-4 w-4 text-primary" />
            <span class="text-sm font-medium text-muted-foreground">{{ t('dashboard.affiliate.commissionBalance') }}</span>
          </div>
          <p class="text-2xl font-bold text-foreground"><span class="text-sm font-normal text-muted-foreground mr-1">{{ stats?.currency }}</span>{{ (stats?.commissionBalance || 0).toFixed(2) }}</p>
        </div>
        <div class="p-4 bg-muted/50 rounded-lg text-center">
          <div class="flex items-center justify-center gap-2 mb-1">
            <TrendingUp class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm font-medium text-muted-foreground">{{ t('dashboard.affiliate.totalCommission') }}</span>
          </div>
          <p class="text-2xl font-bold text-foreground"><span class="text-sm font-normal text-muted-foreground mr-1">{{ stats?.currency }}</span>{{ (stats?.totalCommission || 0).toFixed(2) }}</p>
        </div>
        <div class="p-4 bg-muted/50 rounded-lg text-center">
          <div class="flex items-center justify-center gap-2 mb-1">
            <Users class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm font-medium text-muted-foreground">{{ t('dashboard.affiliate.totalReferrals') }}</span>
          </div>
          <p class="text-2xl font-bold text-foreground">{{ stats?.totalRegisteredReferrals || 0 }}</p>
        </div>
        <div class="p-4 bg-muted/50 rounded-lg text-center">
          <div class="flex items-center justify-center gap-2 mb-1">
            <Percent class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm font-medium text-muted-foreground">{{ t('dashboard.affiliate.commissionRate') }}</span>
          </div>
          <p class="text-2xl font-bold text-foreground">{{ ((stats?.commissionRate || 0) * 100).toFixed(0) }}%</p>
        </div>
      </div>

      <!-- Referral link -->
      <div class="p-4 bg-muted/50 rounded-lg space-y-3">
        <span class="text-sm font-medium text-muted-foreground">{{ t('dashboard.affiliate.referralLink') }}</span>
        <div class="flex gap-2">
          <Input :model-value="stats?.referralLink ?? ''" readonly class="font-mono text-sm bg-background" />
          <Button variant="outline" size="icon" class="shrink-0" @click="handleCopy">
            <Check v-if="copied" class="h-4 w-4" />
            <Copy v-else class="h-4 w-4" />
          </Button>
        </div>
        <div v-if="(stats?.referrerSignupBonus || 0) > 0" class="flex items-center gap-2 text-sm text-muted-foreground">
          <Gift class="h-4 w-4" />
          <span>{{ t('dashboard.affiliate.referrerBonus', { amount: stats?.referrerSignupBonus }) }}</span>
        </div>
      </div>

      <!-- Quick links to sub-views -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          class="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
          @click="view = 'referrals'"
        >
          <div class="flex items-center gap-3">
            <Users class="h-5 w-5 text-muted-foreground" />
            <p class="text-sm font-medium">{{ t('dashboard.affiliate.referralsTab') }}</p>
          </div>
          <ArrowRight class="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          class="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
          @click="view = 'commissions'"
        >
          <div class="flex items-center gap-3">
            <Wallet class="h-5 w-5 text-muted-foreground" />
            <p class="text-sm font-medium">{{ t('dashboard.affiliate.commissionsTab') }}</p>
          </div>
          <ArrowRight class="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </CardContent>
  </Card>
</template>
