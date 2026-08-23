<script setup lang="ts">
import { authClientVue } from "@libs/auth/authClient"
import { toast } from 'vue-sonner'
import { useForm } from 'vee-validate'
import { createValidators } from '@libs/validators'
import { z } from 'zod'
import { Loader2 } from 'lucide-vue-next'

// Set page layout
definePageMeta({
  layout: 'default'
  // No middleware needed - auth.global.ts handles authentication automatically
})

// Set page head information
const { t, locale } = useI18n()
useHead({
  title: t('dashboard.metadata.title'),
  meta: [
    { name: 'description', content: t('dashboard.metadata.description') },
    { name: 'keywords', content: t('dashboard.metadata.keywords') }
  ]
})

const session = authClientVue.useSession()
const user = computed(() => session.value?.data?.user)

// Auto-claim referral code from cookie on mount
onMounted(async () => {
  const hasCookie = document.cookie.split(';').some(c => c.trim().startsWith('referral_code='))
  if (hasCookie) {
    try {
      const result = await $fetch('/api/affiliate/claim', { method: 'POST' })
      if (result && (result as any).applied) {
        console.info('[Affiliate] Referral code claimed successfully')
        if ((result as any).bonusGranted === false) {
          toast.error(t('dashboard.affiliate.bonusFailed'))
        }
      }
    } catch (err) {
      console.warn('[Affiliate] Failed to claim referral code:', err)
      toast.error(t('dashboard.affiliate.claimFailed'))
    }
  }
})

// Reactive state
const loading = ref(true)
const isEditing = ref(false)
const refreshKey = ref(0)

// Create internationalized validators for profile update
const validators = createValidators(t)

// Create a specific schema for profile updates that allows empty image
const profileUpdateSchema = z.object({
  name: z.string()
    .min(2, t('validators.user.name.minLength', { min: 2 }))
    .max(50, t('validators.user.name.maxLength', { max: 50 })),
  image: z.string()
    .url(t('validators.user.image.invalidUrl'))
    .optional()
    .or(z.literal(''))
})

// Form validation using vee-validate
const { handleSubmit, errors, defineField, isSubmitting, resetForm, setValues } = useForm({
  validationSchema: profileUpdateSchema,
  initialValues: {
    name: '',
    image: ''
  }
})

// Define form fields with validation
const [name, nameAttrs] = defineField('name', {
  validateOnBlur: true
})
const [image, imageAttrs] = defineField('image', {
  validateOnBlur: true
})

// Legacy support for DashboardTabs component props
const editForm = computed(() => ({
  name: name.value,
  image: image.value
}))

// Watch user data changes and update form
watch([user, () => session.value?.isPending, refreshKey], ([userData, isPending]) => {
  if (userData) {
    setValues({
      name: userData.name || '',
      image: userData.image || ''
    })
    loading.value = false
  } else if (!isPending) {
    loading.value = false
  }
}, { immediate: true })

// Format date
const formatDate = (dateString: string | Date) => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  const currentLocale = locale.value
  return date.toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Get user role display name
const getRoleDisplayName = (role: string) => {
  switch (role) {
    case 'admin':
      return t('dashboard.roles.admin')
    case 'user':
      return t('dashboard.roles.user')
    default:
      return role
  }
}

// Get user role badge variant
const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case 'admin':
      return 'destructive'
    case 'user':
      return 'secondary'
    default:
      return 'outline'
  }
}

// Handle user profile update using validation
const handleUpdateProfile = handleSubmit(async (values) => {
  if (!user.value) return
  
  const { data, error } = await authClientVue.updateUser({
    name: values.name?.trim() || undefined,
    image: values.image?.trim() || undefined,
  })
  
  if (error) {
    console.error('Failed to update profile:', error)
    // Show error message
    toast.error(error.message || t('dashboard.profile.updateError'))
    return
  }
  
  isEditing.value = false
  // Show success message
  toast.success(t('dashboard.profile.updateSuccess'))
  
  // Force refresh component state to ensure latest data is displayed
  refreshKey.value = refreshKey.value + 1
  
  // Actively fetch latest session data
  setTimeout(async () => {
    try {
      await authClientVue.getSession()
    } catch (error) {
      console.error('Failed to refresh session:', error)
    }
  }, 100)
})

// Cancel edit and reset form to original values
const handleCancelEdit = () => {
  if (user.value) {
    setValues({
      name: user.value.name || '',
      image: user.value.image || ''
    })
  }
  isEditing.value = false
}

// Legacy support - handle edit form changes from child component
const handleSetEditForm = (form: any) => {
  if (form.name !== undefined) {
    name.value = form.name
  }
  if (form.image !== undefined) {
    image.value = form.image
  }
}

// Note: Authentication is handled by the auth middleware
</script>

<template>
  <div class="container py-8">
    <div class="max-w-4xl mx-auto space-y-6">
      <!-- Page title -->
      <div class="text-center">
        <h1 class="text-3xl font-bold tracking-tight">
          {{ t('dashboard.title') }}
        </h1>
        <p class="text-muted-foreground mt-2">
          {{ t('dashboard.description') }}
        </p>
      </div>

      <!-- Loading state -->
      <div v-if="session.isPending || loading" class="flex items-center justify-center h-40">
        <Loader2 class="h-10 w-10 animate-spin text-primary" />
      </div>

      <!-- Dashboard tabs -->
      <DashboardTabs
        v-else-if="user"
        :user="user"
        :is-editing="isEditing"
        :edit-form="editForm"
        :update-loading="isSubmitting"
        :form-errors="errors as Record<string, string>"
        @set-editing="isEditing = $event"
        @set-edit-form="handleSetEditForm"
        @update-profile="handleUpdateProfile"
        @cancel-edit="handleCancelEdit"
        :format-date="formatDate"
        :get-role-display-name="getRoleDisplayName"
        :get-role-badge-variant="getRoleBadgeVariant"
      />
    </div>
  </div>
</template>
