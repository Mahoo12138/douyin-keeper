<template>
  <div class="container max-w-3xl mx-auto py-10 px-5">
    <div class="mb-6">
      <NuxtLink :to="pricingListPath" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft class="h-4 w-4" />
        {{ $t('admin.pricing.backToList') }}
      </NuxtLink>
    </div>

    <h1 class="text-2xl font-bold mb-8">
      {{ isNew ? $t('admin.pricing.createPlan') : $t('admin.pricing.editPlan') }}
    </h1>

    <div v-if="pageLoading" class="flex items-center gap-2 text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      {{ $t('common.loading') }}
    </div>

    <div v-else class="space-y-6">
      <!-- Plan Information (i18n) -->
      <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div class="flex flex-col space-y-1.5 p-6">
          <h3 class="text-lg font-semibold leading-none tracking-tight">{{ $t('admin.pricing.sections.planInfo') }}</h3>
          <p class="text-sm text-muted-foreground">{{ $t('admin.pricing.sections.planInfoDesc') }}</p>
        </div>
        <div class="p-6 pt-0">
          <div class="flex gap-1 mb-6 border-b overflow-x-auto">
            <button
              v-for="locale in allLocales"
              :key="locale"
              type="button"
              :class="['px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap', activeLocale === locale ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground']"
              @click="activeLocale = locale"
            >
              {{ getLocaleLabel(locale) }}
              <span v-if="locale === defaultLocale" class="ml-1 text-xs text-muted-foreground">(default)</span>
            </button>
          </div>

          <div class="space-y-4">
            <div class="space-y-2">
              <label class="text-sm font-medium">{{ $t('admin.pricing.form.name') }}</label>
              <input
                v-model="i18nData[activeLocale].name"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                :placeholder="activeLocale === defaultLocale ? 'e.g. Monthly Plan' : getLocaleLabel(activeLocale) + ' name'"
              />
              <p v-if="activeLocale !== defaultLocale && !i18nData[activeLocale]?.name && i18nData[defaultLocale]?.name" class="text-xs text-muted-foreground">
                Fallback: {{ i18nData[defaultLocale].name }}
              </p>
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium">{{ $t('admin.pricing.form.description') }}</label>
              <input
                v-model="i18nData[activeLocale].description"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                :placeholder="activeLocale === defaultLocale ? 'e.g. Monthly recurring subscription' : getLocaleLabel(activeLocale) + ' description'"
              />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium">{{ $t('admin.pricing.form.durationLabel') }}</label>
              <input
                v-model="i18nData[activeLocale].duration"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                :placeholder="activeLocale === defaultLocale ? 'month / lifetime / one-time' : getLocaleLabel(activeLocale) + ' duration label'"
              />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium">{{ $t('admin.pricing.form.features') }}</label>
              <textarea
                v-model="i18nData[activeLocale].features"
                rows="5"
                class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                placeholder="- All premium features&#10;- Priority support&#10;- Unlimited access"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Pricing -->
      <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div class="flex flex-col space-y-1.5 p-6">
          <h3 class="text-lg font-semibold leading-none tracking-tight">{{ $t('admin.pricing.sections.pricing') }}</h3>
          <p class="text-sm text-muted-foreground">{{ $t('admin.pricing.sections.pricingDesc') }}</p>
        </div>
        <div class="p-6 pt-0 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2"><label class="text-sm font-medium">{{ $t('admin.pricing.fields.provider') }}</label><select v-model="form.provider" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option v-for="p in providers" :key="p" :value="p">{{ p.charAt(0).toUpperCase() + p.slice(1) }}</option></select></div>
            <div class="space-y-2"><label class="text-sm font-medium">{{ $t('admin.pricing.fields.currency') }}</label><select v-model="form.currency" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option v-for="c in currencies" :key="c" :value="c">{{ c }}</option></select></div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2"><label class="text-sm font-medium">{{ $t('admin.pricing.fields.amount') }}</label><input v-model="form.amount" type="number" step="0.01" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="10.00" /></div>
            <div class="space-y-2"><label class="text-sm font-medium">{{ $t('admin.pricing.fields.originalPrice') }}</label><input v-model="form.originalPrice" type="number" step="0.01" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" :placeholder="$t('admin.pricing.form.originalPricePlaceholder')" /></div>
          </div>
          <div class="border-t" />
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2"><label class="text-sm font-medium">{{ $t('admin.pricing.fields.durationType') }}</label><select v-model="form.durationType" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option v-for="d in durationTypes" :key="d" :value="d">{{ d }}</option></select></div>
            <div v-if="form.durationType !== 'credits'" class="space-y-2"><label class="text-sm font-medium">{{ $t('admin.pricing.fields.durationMonths') }}</label><input v-model="form.durationMonths" type="number" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="1" /></div>
            <div v-else class="space-y-2"><label class="text-sm font-medium">{{ $t('admin.pricing.fields.credits') }}</label><input v-model="form.credits" type="number" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="100" /></div>
          </div>
        </div>
      </div>

      <!-- Provider Configuration -->
      <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div class="flex flex-col space-y-1.5 p-6">
          <h3 class="text-lg font-semibold leading-none tracking-tight">{{ $t('admin.pricing.sections.providerConfig') }}</h3>
          <p class="text-sm text-muted-foreground">{{ $t('admin.pricing.sections.providerConfigDesc') }}</p>
        </div>
        <div class="p-6 pt-0">
          <div v-if="providerIdConfig" class="space-y-2">
            <label class="text-sm font-medium">{{ $t(`admin.pricing.fields.${providerIdConfig.key}`) }}</label>
            <input v-model="form[providerIdConfig.field]" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" :placeholder="providerIdConfig.placeholder" />
          </div>
          <div v-else class="flex items-center gap-2 text-sm text-muted-foreground">
            <Info class="h-4 w-4" />
            {{ $t('admin.pricing.sections.noProviderConfig') }}
          </div>
        </div>
      </div>

      <!-- Display Settings -->
      <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div class="flex flex-col space-y-1.5 p-6">
          <h3 class="text-lg font-semibold leading-none tracking-tight">{{ $t('admin.pricing.sections.displaySettings') }}</h3>
          <p class="text-sm text-muted-foreground">{{ $t('admin.pricing.sections.displaySettingsDesc') }}</p>
        </div>
        <div class="p-6 pt-0 space-y-4">
          <div class="flex items-center gap-8">
            <label class="flex items-center gap-3 text-sm"><input v-model="form.recommended" type="checkbox" class="h-4 w-4 rounded border-input" /> {{ $t('admin.pricing.fields.recommended') }}</label>
            <label class="flex items-center gap-3 text-sm"><input v-model="form.isActive" type="checkbox" class="h-4 w-4 rounded border-input" /> {{ $t('admin.pricing.fields.active') }}</label>
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium">{{ $t('admin.pricing.fields.locales') }}</label>
            <input v-model="form.locales" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" :placeholder="$t('admin.pricing.form.localesPlaceholder')" />
            <p class="text-xs text-muted-foreground">{{ $t('admin.pricing.form.localesHint') }}</p>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-3 pt-2">
        <NuxtLink :to="pricingListPath" class="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-10 px-4">{{ $t('actions.cancel') }}</NuxtLink>
        <button class="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4" :disabled="saving" @click="handleSubmit">
          <template v-if="saving"><Loader2 class="h-4 w-4 mr-2 animate-spin" />{{ $t('admin.pricing.saving') }}</template>
          <template v-else><Save class="h-4 w-4 mr-2" />{{ $t('admin.pricing.savePlan') }}</template>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, Save, Loader2, Info } from 'lucide-vue-next'
import { locales as supportedLocales, defaultLocale, getLocaleLabel } from '@libs/i18n'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const pricingListPath = localePath('/admin/pricing')

const planId = route.params.id as string
const isNew = planId === 'new'

const providers = ['stripe', 'wechat', 'alipay', 'paypal', 'creem', 'dodo']
const currencies = ['USD', 'CNY', 'EUR', 'GBP', 'JPY']
const durationTypes = ['recurring', 'one_time', 'credits']

const PROVIDER_ID_FIELDS: Record<string, { field: string; key: string; placeholder: string } | null> = {
  stripe: { field: 'stripePriceId', key: 'stripePriceId', placeholder: 'price_xxx' },
  paypal: { field: 'paypalPlanId', key: 'paypalPlanId', placeholder: 'P-xxx' },
  creem: { field: 'creemProductId', key: 'creemProductId', placeholder: 'prod_xxx' },
  dodo: { field: 'dodoProductId', key: 'dodoProductId', placeholder: 'pdt_xxx' },
  wechat: null,
  alipay: null,
}

interface I18nFields { name: string; description: string; duration: string; features: string }
const EMPTY_I18N: I18nFields = { name: '', description: '', duration: '', features: '' }

function featuresToMarkdown(features: unknown): string {
  if (!features) return ''
  if (typeof features === 'string') return features
  if (Array.isArray(features)) return features.map((f: string) => `- ${f}`).join('\n')
  return ''
}

const activeLocale = ref<string>(defaultLocale)
const pageLoading = ref(!isNew)
const saving = ref(false)

const i18nData = ref<Record<string, I18nFields>>(
  Object.fromEntries(supportedLocales.map(loc => [loc, { ...EMPTY_I18N }]))
)

const allLocales = computed(() => Object.keys(i18nData.value))

const form = ref<Record<string, any>>({
  provider: 'stripe', amount: '', originalPrice: '', currency: 'USD',
  durationType: 'one_time', durationMonths: '1', credits: '',
  recommended: false, isActive: true, locales: '',
  stripePriceId: '', paypalPlanId: '', creemProductId: '', dodoProductId: '',
})

const providerIdConfig = computed(() => PROVIDER_ID_FIELDS[form.value.provider] || null)

const ssrHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined

if (!isNew) {
  try {
    const data = await $fetch<{ plans: any[] }>('/api/admin/pricing-plans', { headers: ssrHeaders })
    const plan = (data.plans || []).find((p: any) => p.id === planId)
    if (plan) {
      form.value = {
        provider: plan.provider, amount: plan.amount, originalPrice: plan.originalPrice || '',
        currency: plan.currency, durationType: plan.durationType,
        durationMonths: plan.durationMonths?.toString() || '1', credits: plan.credits?.toString() || '',
        recommended: plan.recommended, isActive: plan.isActive,
        locales: plan.locales?.join(', ') || '',
        stripePriceId: plan.stripePriceId || '', paypalPlanId: plan.paypalPlanId || '',
        creemProductId: plan.creemProductId || '', dodoProductId: plan.dodoProductId || '',
      }

      const newI18n: Record<string, I18nFields> = {}
      for (const loc of supportedLocales) {
        const existing = plan.i18n?.[loc]
        newI18n[loc] = existing
          ? { name: existing.name || '', description: existing.description || '', duration: existing.duration || '', features: featuresToMarkdown(existing.features) }
          : { ...EMPTY_I18N }
      }
      for (const [loc, d] of Object.entries(plan.i18n || {})) {
        if (!newI18n[loc]) {
          const data = d as any
          newI18n[loc] = { name: data.name || '', description: data.description || '', duration: data.duration || '', features: featuresToMarkdown(data.features) }
        }
      }
      i18nData.value = newI18n
    } else {
      navigateTo(pricingListPath)
    }
  } catch { navigateTo(pricingListPath) }
  pageLoading.value = false
}

async function handleSubmit() {
  saving.value = true
  try {
    const i18n: Record<string, any> = {}
    for (const [locale, fields] of Object.entries(i18nData.value)) {
      if (fields.name) {
        i18n[locale] = { name: fields.name, description: fields.description, duration: fields.duration, features: fields.features }
      }
    }

    const payload: any = {
      provider: form.value.provider, amount: parseFloat(form.value.amount),
      originalPrice: form.value.originalPrice ? parseFloat(form.value.originalPrice) : null,
      currency: form.value.currency, durationType: form.value.durationType,
      durationMonths: form.value.durationType !== 'credits' ? parseInt(form.value.durationMonths) : null,
      credits: form.value.durationType === 'credits' ? parseInt(form.value.credits) : null,
      recommended: form.value.recommended, isActive: form.value.isActive,
      locales: form.value.locales ? form.value.locales.split(',').map((s: string) => s.trim()).filter(Boolean) : null,
      stripePriceId: form.value.stripePriceId || null, paypalPlanId: form.value.paypalPlanId || null,
      creemProductId: form.value.creemProductId || null, dodoProductId: form.value.dodoProductId || null,
      i18n,
    }
    if (!isNew) payload.id = planId

    await $fetch('/api/admin/pricing-plans', { method: isNew ? 'POST' : 'PUT', body: payload })
    navigateTo(pricingListPath)
  } finally { saving.value = false }
}
</script>
