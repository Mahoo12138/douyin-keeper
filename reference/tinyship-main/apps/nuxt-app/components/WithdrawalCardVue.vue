<script setup lang="ts">
import { Wallet, ArrowLeft, ArrowRight, History, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useForm } from 'vee-validate'
import { createWithdrawalValidators } from '@libs/validators'

const { t } = useI18n()

interface Withdrawal {
  id: string
  amount: string
  currency: string
  paymentMethod: string
  paymentAccount: string
  status: string
  adminNote: string | null
  createdAt: string
}

type ViewState = 'form' | 'history'

const balance = ref(0)
const minAmount = ref(100)
const withdrawals = ref<Withdrawal[]>([])
const loading = ref(true)
const submitting = ref(false)
const view = ref<ViewState>('form')

const { withdrawalFormSchema } = createWithdrawalValidators(t)

const { handleSubmit, errors, defineField, isSubmitting, resetForm } = useForm({
  validationSchema: withdrawalFormSchema,
  initialValues: {
    amount: '',
    paymentMethod: undefined as 'alipay' | 'paypal' | 'bank_transfer' | undefined,
    paymentAccount: '',
  },
})

const [amount, amountAttrs] = defineField('amount', { validateOnBlur: true })
const [paymentMethod] = defineField('paymentMethod', { validateOnBlur: true })
const [paymentAccount, paymentAccountAttrs] = defineField('paymentAccount', { validateOnBlur: true })

const statusVariantMap: Record<string, string> = {
  completed: 'default',
  pending: 'secondary',
  processing: 'outline',
  rejected: 'destructive',
}

async function fetchData() {
  try {
    const [statsRes, historyRes] = await Promise.all([
      $fetch<any>('/api/affiliate/stats'),
      $fetch<any>('/api/withdrawal/history?limit=10'),
    ])
    balance.value = statsRes?.commissionBalance || 0
    minAmount.value = statsRes?.minWithdrawalAmount || 100
    withdrawals.value = historyRes?.withdrawals || []
  } catch (err) {
    console.error('Failed to load withdrawal data:', err)
  } finally {
    loading.value = false
  }
}

const onSubmit = handleSubmit(async (values) => {
  const numAmount = parseFloat(values.amount)
  if (numAmount < minAmount.value) {
    toast.error(t('dashboard.withdrawal.minAmount', { amount: minAmount.value }) || `Minimum withdrawal amount: ${minAmount.value}`)
    return
  }
  if (numAmount > balance.value) {
    toast.error(t('dashboard.withdrawal.insufficientBalance') || 'Insufficient balance')
    return
  }

  submitting.value = true
  try {
    await $fetch('/api/withdrawal/request', {
      method: 'POST',
      body: {
        ...values,
        amount: numAmount,
      },
    })
    toast.success(t('dashboard.withdrawal.submitSuccess') || 'Withdrawal request submitted')
    resetForm()
    await fetchData()
  } catch (err: any) {
    toast.error(err?.data?.error || 'Failed to submit withdrawal')
  } finally {
    submitting.value = false
  }
})

onMounted(() => fetchData())
</script>

<template>
  <!-- Loading state -->
  <Card v-if="loading">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Wallet class="h-5 w-5 text-primary" />
        {{ t('dashboard.withdrawal.title') }}
      </CardTitle>
    </CardHeader>
    <CardContent class="flex items-center justify-center py-8">
      <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
    </CardContent>
  </Card>

  <!-- History sub-view -->
  <Card v-else-if="view === 'history'">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <button
          class="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted transition-colors"
          @click="view = 'form'"
        >
          <ArrowLeft class="h-5 w-5" />
        </button>
        {{ t('dashboard.withdrawal.history') }}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="withdrawals.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
        <History class="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p class="text-sm text-muted-foreground">{{ t('dashboard.withdrawal.noHistory') }}</p>
      </div>
      <div v-else class="rounded-md border overflow-x-auto">
        <table class="w-full">
          <thead class="bg-muted">
            <tr>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.withdrawal.table.amount') }}</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.withdrawal.table.method') }}</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.withdrawal.table.account') }}</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.withdrawal.table.status') }}</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{{ t('dashboard.withdrawal.table.date') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="w in withdrawals" :key="w.id" class="hover:bg-muted/50">
              <td class="px-4 py-3 text-sm font-medium">{{ w.currency }} {{ parseFloat(w.amount).toFixed(2) }}</td>
              <td class="px-4 py-3 text-sm text-muted-foreground">{{ t(`dashboard.withdrawal.methods.${w.paymentMethod}`) }}</td>
              <td class="px-4 py-3 text-sm text-muted-foreground">{{ w.paymentAccount }}</td>
              <td class="px-4 py-3">
                <Badge :variant="(statusVariantMap[w.status] || 'secondary') as any">
                  {{ t(`dashboard.withdrawal.status.${w.status}`) }}
                </Badge>
              </td>
              <td class="px-4 py-3 text-sm text-muted-foreground">{{ new Date(w.createdAt).toLocaleDateString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>

  <!-- Form (default view) -->
  <Card v-else>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Wallet class="h-5 w-5 text-primary" />
        {{ t('dashboard.withdrawal.title') }}
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-6">
      <!-- Balance -->
      <div class="p-4 bg-muted/50 rounded-lg text-center">
        <div class="flex items-center justify-center gap-2 mb-1">
          <Wallet class="h-4 w-4 text-primary" />
          <span class="text-sm font-medium text-muted-foreground">{{ t('dashboard.withdrawal.balance') }}</span>
        </div>
        <p class="text-2xl font-bold text-foreground">{{ balance.toFixed(2) }}</p>
        <p class="text-xs text-muted-foreground mt-1">
          {{ t('dashboard.withdrawal.minAmount', { amount: minAmount }) || `Min. withdrawal: ${minAmount}` }}
        </p>
      </div>

      <!-- Withdrawal form -->
      <form class="space-y-4" @submit.prevent="onSubmit">
        <div class="grid grid-cols-1 sm:grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1.5">
          <Label class="sm:text-right sm:min-w-[5rem] sm:pt-2.5">{{ t('dashboard.withdrawal.amount') }}</Label>
          <div>
            <Input
              v-model="amount"
              v-bind="amountAttrs"
              type="number"
              step="0.01"
              :min="minAmount"
              :placeholder="t('dashboard.withdrawal.amountPlaceholder')"
              :class="errors.amount ? 'border-destructive' : ''"
              :aria-invalid="errors.amount ? 'true' : 'false'"
            />
            <span v-if="errors.amount" class="text-destructive text-xs mt-1 block">
              {{ errors.amount }}
            </span>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1.5">
          <Label class="sm:text-right sm:min-w-[5rem] sm:pt-2.5">{{ t('dashboard.withdrawal.paymentMethod') }}</Label>
          <div>
            <Select v-model="paymentMethod">
              <SelectTrigger
                :class="errors.paymentMethod ? 'border-destructive' : ''"
                :aria-invalid="errors.paymentMethod ? 'true' : 'false'"
              >
                <SelectValue :placeholder="t('dashboard.withdrawal.selectMethod')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alipay">{{ t('dashboard.withdrawal.methods.alipay') }}</SelectItem>
                <SelectItem value="paypal">{{ t('dashboard.withdrawal.methods.paypal') }}</SelectItem>
                <SelectItem value="bank_transfer">{{ t('dashboard.withdrawal.methods.bank_transfer') }}</SelectItem>
              </SelectContent>
            </Select>
            <span v-if="errors.paymentMethod" class="text-destructive text-xs mt-1 block">
              {{ errors.paymentMethod }}
            </span>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1.5">
          <Label class="sm:text-right sm:min-w-[5rem] sm:pt-2.5">{{ t('dashboard.withdrawal.paymentAccount') }}</Label>
          <div>
            <Input
              v-model="paymentAccount"
              v-bind="paymentAccountAttrs"
              :placeholder="t('dashboard.withdrawal.accountPlaceholder')"
              :class="errors.paymentAccount ? 'border-destructive' : ''"
              :aria-invalid="errors.paymentAccount ? 'true' : 'false'"
            />
            <span v-if="errors.paymentAccount" class="text-destructive text-xs mt-1 block">
              {{ errors.paymentAccount }}
            </span>
          </div>
        </div>
        <div class="sm:pl-[calc(5rem+1rem)]">
          <Button type="submit" :disabled="submitting || isSubmitting" class="w-full">
            <Loader2 v-if="submitting || isSubmitting" class="h-4 w-4 animate-spin" />
            <template v-else>{{ t('dashboard.withdrawal.submit') }}</template>
          </Button>
        </div>
      </form>

      <!-- View history link -->
      <button
        class="flex items-center justify-between w-full p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
        @click="view = 'history'"
      >
        <div class="flex items-center gap-3">
          <History class="h-5 w-5 text-muted-foreground" />
          <p class="text-sm font-medium">{{ t('dashboard.withdrawal.history') }}</p>
        </div>
        <ArrowRight class="h-4 w-4 text-muted-foreground" />
      </button>
    </CardContent>
  </Card>
</template>
