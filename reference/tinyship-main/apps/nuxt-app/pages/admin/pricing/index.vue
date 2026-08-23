<template>
  <div class="container mx-auto py-10 px-5">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">{{ $t('admin.pricing.title') }}</h1>
        <p class="text-muted-foreground text-sm mt-1">
          {{ $t('admin.pricing.description') }}
          <span :class="['inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ml-2', pricingMode === 'dynamic' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground']">
            {{ pricingMode === 'dynamic' ? $t('admin.pricing.mode.dynamic') : $t('admin.pricing.mode.static') }}
          </span>
        </p>
      </div>
      <div class="flex gap-2">
        <button class="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-10 px-4" :disabled="importing" @click="handleImport">
          <Upload class="h-4 w-4 mr-2" />{{ importing ? $t('admin.pricing.importing') : $t('admin.pricing.importStatic') }}
        </button>
        <NuxtLink :to="localePath('/admin/pricing/new')" class="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4">
          <Plus class="h-4 w-4 mr-2" />{{ $t('admin.pricing.createPlan') }}
        </NuxtLink>
      </div>
    </div>

    <div v-if="uncoveredLocales.length > 0 && pricingMode === 'dynamic'" class="flex items-center gap-2 p-3 mb-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
      <AlertTriangle class="h-4 w-4 text-yellow-600" />
      <span class="text-sm text-yellow-800 dark:text-yellow-200">{{ $t('admin.pricing.localeCoverageWarning') }} [{{ uncoveredLocales.join(', ') }}]</span>
    </div>

    <div class="flex gap-2 mb-4">
      <button :class="['inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3', activeTab === 'subscription' ? 'bg-primary text-primary-foreground' : 'border border-input bg-background hover:bg-accent']" @click="activeTab = 'subscription'">{{ $t('admin.pricing.tabs.subscription') }} ({{ subscriptionPlans.length }})</button>
      <button :class="['inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3', activeTab === 'credits' ? 'bg-primary text-primary-foreground' : 'border border-input bg-background hover:bg-accent']" @click="activeTab = 'credits'">{{ $t('admin.pricing.tabs.credits') }} ({{ creditPlans.length }})</button>
    </div>

    <div v-if="loading" class="animate-pulse text-muted-foreground">{{ $t('common.loading') }}</div>

    <p v-else-if="!displayedPlans.length" class="text-muted-foreground py-8 text-center">{{ $t('admin.pricing.noPlans') }}</p>

    <div v-else class="border rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="px-4 py-3 text-left font-medium">{{ $t('admin.pricing.table.name') }}</th>
            <th class="px-4 py-3 text-left font-medium">{{ $t('admin.pricing.table.provider') }}</th>
            <th class="px-4 py-3 text-left font-medium">{{ $t('admin.pricing.table.price') }}</th>
            <th class="px-4 py-3 text-left font-medium">{{ $t('admin.pricing.table.type') }}</th>
            <th class="px-4 py-3 text-left font-medium">{{ $t('admin.pricing.table.locales') }}</th>
            <th class="px-4 py-3 text-left font-medium">{{ $t('admin.pricing.table.status') }}</th>
            <th class="px-4 py-3 text-right font-medium">{{ $t('admin.pricing.table.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="plan in displayedPlans" :key="plan.id" class="border-t">
            <td class="px-4 py-3">
              <div class="font-medium">{{ plan.i18n?.en?.name || plan.id }}</div>
              <span v-if="plan.recommended" class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold mt-1">{{ $t('admin.pricing.fields.recommended') }}</span>
            </td>
            <td class="px-4 py-3"><span class="inline-flex items-center rounded-full border bg-secondary px-2.5 py-0.5 text-xs font-semibold">{{ plan.provider }}</span></td>
            <td class="px-4 py-3">
              <span v-if="plan.originalPrice" class="line-through text-muted-foreground mr-1">{{ plan.currency }} {{ plan.originalPrice }}</span>
              <span class="font-medium">{{ plan.currency }} {{ plan.amount }}</span>
            </td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">{{ plan.durationType }}</span>
              {{ plan.durationType === 'credits' ? ` (${plan.credits})` : plan.durationMonths ? ` (${plan.durationMonths}mo)` : '' }}
            </td>
            <td class="px-4 py-3">
              <span v-if="plan.locales" class="text-xs">{{ plan.locales.join(', ') }}</span>
              <span v-else class="text-muted-foreground text-xs">{{ $t('admin.pricing.table.allLocales') }}</span>
            </td>
            <td class="px-4 py-3">
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" :checked="plan.isActive" class="sr-only peer" @change="handleToggleActive(plan)" />
                <div class="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-primary transition-colors" />
              </label>
            </td>
            <td class="px-4 py-3 text-right">
              <NuxtLink :to="localePath(`/admin/pricing/${plan.id}`)" class="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent h-10 w-10">
                <Pencil class="h-4 w-4" />
              </NuxtLink>
              <button class="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent h-10 w-10" @click="handleDelete(plan.id)">
                <Trash2 class="h-4 w-4" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, Pencil, Trash2, Upload, AlertTriangle } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const localePath = useLocalePath()

const plans = ref<any[]>([])
const loading = ref(true)
const importing = ref(false)
const activeTab = ref<'subscription' | 'credits'>('subscription')
const pricingMode = ref('static')

const subscriptionPlans = computed(() => plans.value.filter(p => p.durationType !== 'credits'))
const creditPlans = computed(() => plans.value.filter(p => p.durationType === 'credits'))
const displayedPlans = computed(() => activeTab.value === 'subscription' ? subscriptionPlans.value : creditPlans.value)

const supportedLocales = ['en', 'zh-CN']
const uncoveredLocales = computed(() => {
  const covered = new Set<string>()
  plans.value.filter(p => p.isActive).forEach(p => {
    if (!p.locales) supportedLocales.forEach(l => covered.add(l))
    else p.locales.forEach((l: string) => covered.add(l))
  })
  return supportedLocales.filter(l => !covered.has(l))
})

const ssrHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined

async function fetchPlans() {
  try {
    const data = await $fetch<{ plans: any[]; pricingMode?: string }>('/api/admin/pricing-plans', { headers: ssrHeaders })
    plans.value = data.plans || []
    if (data.pricingMode) pricingMode.value = data.pricingMode
  } catch (err) {
    console.error('Error fetching plans:', err)
  } finally {
    loading.value = false
  }
}

async function handleDelete(id: string) {
  if (!confirm(t('admin.pricing.confirmDelete'))) return
  await $fetch(`/api/admin/pricing-plans?id=${id}`, { method: 'DELETE' })
  fetchPlans()
}

async function handleToggleActive(plan: any) {
  await $fetch('/api/admin/pricing-plans', { method: 'PUT', body: { id: plan.id, isActive: !plan.isActive } })
  fetchPlans()
}

async function handleImport() {
  if (!confirm(t('admin.pricing.importConfirm'))) return
  importing.value = true
  try {
    const data = await $fetch<{ imported: number }>('/api/admin/pricing-plans/import', { method: 'POST' })
    alert(`${t('admin.pricing.importSuccess')} (${data.imported})`)
    fetchPlans()
  } finally { importing.value = false }
}

await fetchPlans()
</script>
