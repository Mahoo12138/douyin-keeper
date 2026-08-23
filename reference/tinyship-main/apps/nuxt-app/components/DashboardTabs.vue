<script setup lang="ts">
import { 
  CreditCard, 
  ShoppingCart,
  User,
  Settings,
  CheckCircle,
  Edit,
  Save,
  X,
  Coins,
  Users,
  Wallet
} from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const { t } = useI18n()
const { public: publicConfig } = useRuntimeConfig()
const affiliateEnabled = publicConfig.affiliateEnabled

type TabType = 'profile' | 'subscription' | 'credits' | 'orders' | 'account' | 'affiliate' | 'withdrawal'

interface Props {
  user: any
  isEditing: boolean
  editForm: any
  updateLoading: boolean
  formatDate: (date: string | Date) => string
  getRoleDisplayName: (role: string) => string
  getRoleBadgeVariant: (role: string) => any
  formErrors?: Record<string, string>
}

interface Emits {
  (e: 'setEditing', editing: boolean): void
  (e: 'setEditForm', form: any): void
  (e: 'updateProfile'): void
  (e: 'cancelEdit'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const activeTab = ref<TabType>('profile')
const showChangePasswordDialog = ref(false)
const showDeleteAccountDialog = ref(false)

/**
 * Dashboard tab configuration
 */
const tabs = computed(() => [
  {
    id: 'profile' as TabType,
    label: t('dashboard.tabs.profile.title'),
    icon: User,
    description: t('dashboard.tabs.profile.description')
  },
  {
    id: 'subscription' as TabType,
    label: t('dashboard.subscription.title'),
    icon: CreditCard,
    description: t('dashboard.tabs.subscription.description')
  },
  {
    id: 'credits' as TabType,
    label: t('dashboard.tabs.credits.title'),
    icon: Coins,
    description: t('dashboard.tabs.credits.description')
  },
  {
    id: 'orders' as TabType,
    label: t('dashboard.orders.title'),
    icon: ShoppingCart,
    description: t('dashboard.tabs.orders.description')
  },
  {
    id: 'account' as TabType,
    label: t('dashboard.tabs.account.title'),
    icon: Settings,
    description: t('dashboard.tabs.account.description')
  },
  ...(affiliateEnabled ? [
    {
      id: 'affiliate' as TabType,
      label: t('dashboard.affiliate.title'),
      icon: Users,
      description: t('dashboard.affiliate.description')
    },
    {
      id: 'withdrawal' as TabType,
      label: t('dashboard.withdrawal.title'),
      icon: Wallet,
      description: t('dashboard.withdrawal.description')
    }
  ] : [])
])

/**
 * Handle setting edit mode
 * @param editing - Whether edit mode is active
 */
const handleSetEditing = (editing: boolean) => {
  emit('setEditing', editing)
}

/**
 * Handle updating edit form data
 * @param form - Form data object
 */
const handleSetEditForm = (form: any) => {
  emit('setEditForm', form)
}

/**
 * Handle profile update submission
 */
const handleUpdateProfile = () => {
  emit('updateProfile')
}

/**
 * Handle canceling edit operation
 */
const handleCancelEdit = () => {
  emit('cancelEdit')
}
</script>

<template>
  <Card class="py-0">
    <CardContent class="p-0">
      <div class="flex min-h-[600px] overflow-hidden">
        <!-- Left sidebar navigation - fixed width -->
        <div class="w-64 flex-shrink-0 border-r bg-muted/30">
          <div class="p-4">
            <nav class="space-y-1">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                @click="activeTab = tab.id"
                :class="[
                  'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all',
                  activeTab === tab.id
                    ? 'bg-background text-foreground shadow-sm border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                ]"
              >
                <component :is="tab.icon" class="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm">{{ tab.label }}</div>
                  <div v-if="tab.description" class="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {{ tab.description }}
                  </div>
                </div>
              </button>
            </nav>
          </div>
        </div>

        <!-- Right content area - scrollable -->
        <div class="flex-1 overflow-auto">
          <div class="p-6">
            <!-- Profile Tab -->
            <div v-if="activeTab === 'profile'" class="space-y-6">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4">
                  <Avatar class="w-16 h-16">
                    <AvatarImage :src="user?.image" :alt="user?.name || t('dashboard.profile.noNameSet')" />
                    <AvatarFallback class="bg-primary text-primary-foreground text-xl font-bold">
                      {{ user?.name?.charAt(0) || user?.email?.charAt(0) || 'U' }}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 class="text-lg font-medium">{{ user?.name || t('dashboard.profile.noNameSet') }}</h3>
                    <p class="text-sm text-muted-foreground">{{ user?.email }}</p>
                    <div class="flex items-center space-x-2 mt-1">
                      <Badge :variant="getRoleBadgeVariant(user?.role)">
                        {{ getRoleDisplayName(user?.role) }}
                      </Badge>
                      <div v-if="user?.emailVerified" class="flex items-center text-green-600 text-xs">
                        <CheckCircle class="w-3 h-3 mr-1" />
                        {{ t('dashboard.profile.emailVerified') }}
                      </div>
                    </div>
                  </div>
                </div>
                <Button 
                  v-if="!isEditing"
                  variant="outline" 
                  size="sm"
                  @click="handleSetEditing(true)"
                >
                  <Edit class="w-4 h-4 mr-2" />
                  {{ t('actions.edit') }}
                </Button>
              </div>

              <!-- Edit mode -->
              <div v-if="isEditing" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label for="name">{{ t('dashboard.profile.form.labels.name') }}</Label>
                    <div class="relative">
                      <Input
                      id="name"
                      :model-value="editForm?.name || ''"
                      @update:model-value="handleSetEditForm({...editForm, name: $event})"
                      :placeholder="t('dashboard.profile.form.placeholders.name')"
                        :class="cn(formErrors?.name && 'border-destructive')"
                        :aria-invalid="formErrors?.name ? 'true' : 'false'"
                    />
                      <span v-if="formErrors?.name" class="text-destructive text-xs absolute -bottom-5 left-0">
                        {{ formErrors.name }}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label for="email">{{ t('dashboard.profile.form.labels.email') }}</Label>
                    <Input
                      id="email"
                      type="email"
                      :model-value="user?.email || ''"
                      disabled
                      :placeholder="t('dashboard.profile.form.placeholders.email')"
                    />
                    <p class="text-xs text-muted-foreground mt-1">
                      {{ t('dashboard.profile.form.emailReadonly') }}
                    </p>
                  </div>
                </div>
                <div>
                  <Label for="image">{{ t('dashboard.profile.form.labels.image') }}</Label>
                  <div class="relative">
                    <Input
                      id="image"
                      type="url"
                      :model-value="editForm?.image || ''"
                      @update:model-value="handleSetEditForm({...editForm, image: $event})"
                      :placeholder="t('dashboard.profile.form.placeholders.image')"
                      :class="cn(formErrors?.image && 'border-destructive')"
                      :aria-invalid="formErrors?.image ? 'true' : 'false'"
                    />
                    <span v-if="formErrors?.image" class="text-destructive text-xs absolute -bottom-5 left-0">
                      {{ formErrors.image }}
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-1">
                    {{ t('dashboard.profile.form.imageDescription') }}
                  </p>
                </div>
                <div class="flex space-x-2">
                  <Button 
                    @click="handleUpdateProfile"
                    :disabled="updateLoading"
                    size="sm"
                  >
                    <template v-if="updateLoading">
                      {{ t('common.loading') }}
                    </template>
                    <template v-else>
                      <Save class="w-4 h-4 mr-2" />
                      {{ t('actions.save') }}
                    </template>
                  </Button>
                  <Button 
                    variant="outline" 
                    @click="handleCancelEdit"
                    size="sm"
                  >
                    <X class="w-4 h-4 mr-2" />
                    {{ t('actions.cancel') }}
                  </Button>
                </div>
              </div>

              <!-- View mode -->
              <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label class="text-sm font-medium text-muted-foreground">
                    {{ t('dashboard.profile.form.labels.name') }}
                  </Label>
                  <p class="mt-1">{{ user?.name || t('dashboard.profile.noNameSet') }}</p>
                </div>
                <div>
                  <Label class="text-sm font-medium text-muted-foreground">
                    {{ t('dashboard.profile.form.labels.email') }}
                  </Label>
                  <p class="mt-1">{{ user?.email }}</p>
                </div>
                <div>
                  <Label class="text-sm font-medium text-muted-foreground">
                    {{ t('dashboard.account.memberSince') }}
                  </Label>
                  <p class="mt-1">{{ user?.createdAt ? formatDate(user.createdAt) : 'N/A' }}</p>
                </div>
                <div>
                  <Label class="text-sm font-medium text-muted-foreground">
                    {{ t('dashboard.profile.role') }}
                  </Label>
                  <p class="mt-1">{{ getRoleDisplayName(user?.role || 'user') }}</p>
                </div>
              </div>
            </div>

            <!-- Subscription Tab -->
            <div v-else-if="activeTab === 'subscription'" class="space-y-6">
              <SubscriptionCard />
            </div>

            <!-- Credits Tab -->
            <div v-else-if="activeTab === 'credits'" class="space-y-6">
              <CreditsCard />
            </div>

            <!-- Affiliate Tab -->
            <div v-else-if="activeTab === 'affiliate'" class="space-y-6">
              <AffiliateCardVue />
            </div>

            <!-- Withdrawal Tab -->
            <div v-else-if="activeTab === 'withdrawal'" class="space-y-6">
              <WithdrawalCardVue />
            </div>

            <!-- Orders Tab -->
            <OrdersCard v-else-if="activeTab === 'orders'" />

            <!-- Account Tab -->
            <div v-else-if="activeTab === 'account'" class="space-y-6">
              <LinkedAccountsCard />
              
              <Card>
                <CardContent class="p-6">
                  <h3 class="text-lg font-medium mb-4">{{ t('dashboard.accountManagement.title') }}</h3>
                  <div class="space-y-4">
                    <div class="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p class="font-medium">{{ t('dashboard.accountManagement.changePassword.title') }}</p>
                        <p class="text-sm text-muted-foreground">
                          {{ t('dashboard.accountManagement.changePassword.description') }}
                        </p>
                      </div>
                      <Button 
                        variant="outline"
                        @click="showChangePasswordDialog = true"
                      >
                        {{ t('dashboard.accountManagement.changePassword.button') }}
                      </Button>
                    </div>
                    
                    <div class="flex items-center justify-between p-4 border rounded-lg border-red-200">
                      <div>
                        <p class="font-medium text-red-600">{{ t('dashboard.accountManagement.deleteAccount.title') }}</p>
                        <p class="text-sm text-muted-foreground">
                          {{ t('dashboard.accountManagement.deleteAccount.description') }}
                        </p>
                      </div>
                      <Button 
                        variant="destructive"
                        @click="showDeleteAccountDialog = true"
                      >
                        {{ t('dashboard.accountManagement.deleteAccount.button') }}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <ChangePasswordDialog 
                :open="showChangePasswordDialog"
                @update:open="showChangePasswordDialog = $event"
              />
              <DeleteAccountDialog 
                :open="showDeleteAccountDialog"
                @update:open="showDeleteAccountDialog = $event"
              />
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
