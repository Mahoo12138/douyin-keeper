<script setup lang="ts">
import { authClientVue } from "@libs/auth/authClient"
import { toast } from 'vue-sonner'
import { useForm } from 'vee-validate'
import { createValidators } from '@libs/validators'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-vue-next'

const { t } = useI18n()

interface Props {
  open: boolean
}

interface Emits {
  (e: 'update:open', open: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const loading = ref(false)

// Create internationalized validators
const { changePasswordSchema } = createValidators(t)

// Form validation using vee-validate
const { handleSubmit, errors, defineField, isSubmitting, resetForm } = useForm({
  validationSchema: changePasswordSchema,
  initialValues: {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  }
})

// Define form fields with validation
const [currentPassword, currentPasswordAttrs] = defineField('currentPassword', {
  validateOnBlur: true
})
const [newPassword, newPasswordAttrs] = defineField('newPassword', {
  validateOnBlur: true
})
const [confirmPassword, confirmPasswordAttrs] = defineField('confirmPassword', {
  validateOnBlur: true
})

/**
 * Submit form to change password
 */
const onSubmit = handleSubmit(async (values) => {
  loading.value = true
  
  const { data, error } = await authClientVue.changePassword({
    newPassword: values.newPassword,
    currentPassword: values.currentPassword,
    revokeOtherSessions: true
  })
  
  if (error) {
    console.error('Failed to change password:', error)
    const errorMessage = error.message 
      ? `${t('dashboard.accountManagement.changePassword.errors.failed')}: ${error.message}`
      : t('dashboard.accountManagement.changePassword.errors.failed')
    toast.error(errorMessage)
    resetForm()
    loading.value = false
    return
  }
  
  // Show success message
  toast.success(t('dashboard.accountManagement.changePassword.success'))
  
  // Reset form and close dialog
  resetForm()
  emit('update:open', false)
  loading.value = false
})

/**
 * Cancel operation and reset form
 */
const handleCancel = () => {
  resetForm()
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ t('dashboard.accountManagement.changePassword.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('dashboard.accountManagement.changePassword.dialogDescription') }}
        </DialogDescription>
      </DialogHeader>
      
      <form @submit.prevent="onSubmit" class="space-y-6">
        <!-- Current password -->
        <div class="grid gap-2">
          <Label for="current-password">
            {{ t('dashboard.accountManagement.changePassword.form.currentPassword') }}
          </Label>
          <div class="relative">
            <Input
              id="current-password"
              v-bind="currentPasswordAttrs"
              v-model="currentPassword"
              type="password"
              :placeholder="t('dashboard.accountManagement.changePassword.form.currentPasswordPlaceholder')"
              :class="cn(errors.currentPassword && 'border-destructive')"
              :aria-invalid="errors.currentPassword ? 'true' : 'false'"
              autocomplete="current-password"
            />
            <span v-if="errors.currentPassword" class="text-destructive text-xs absolute -bottom-5 left-0">
              {{ errors.currentPassword }}
            </span>
          </div>
        </div>
        
        <!-- New password -->
        <div class="grid gap-2">
          <Label for="new-password">
            {{ t('dashboard.accountManagement.changePassword.form.newPassword') }}
          </Label>
          <div class="relative">
            <Input
              id="new-password"
              v-bind="newPasswordAttrs"
              v-model="newPassword"
              type="password"
              :placeholder="t('dashboard.accountManagement.changePassword.form.newPasswordPlaceholder')"
              :class="cn(errors.newPassword && 'border-destructive')"
              :aria-invalid="errors.newPassword ? 'true' : 'false'"
              autocomplete="new-password"
            />
            <span v-if="errors.newPassword" class="text-destructive text-xs absolute -bottom-5 left-0">
              {{ errors.newPassword }}
            </span>
          </div>
        </div>
        
        <!-- Confirm new password -->
        <div class="grid gap-2">
          <Label for="confirm-password">
            {{ t('dashboard.accountManagement.changePassword.form.confirmPassword') }}
          </Label>
          <div class="relative">
            <Input
              id="confirm-password"
              v-bind="confirmPasswordAttrs"
              v-model="confirmPassword"
              type="password"
              :placeholder="t('dashboard.accountManagement.changePassword.form.confirmPasswordPlaceholder')"
              :class="cn(errors.confirmPassword && 'border-destructive')"
              :aria-invalid="errors.confirmPassword ? 'true' : 'false'"
              autocomplete="new-password"
            />
            <span v-if="errors.confirmPassword" class="text-destructive text-xs absolute -bottom-5 left-0">
              {{ errors.confirmPassword }}
            </span>
          </div>
        </div>
        
        <DialogFooter>
          <Button type="button" variant="outline" @click="handleCancel">
            {{ t('dashboard.accountManagement.changePassword.form.cancel') }}
          </Button>
          <Button 
            type="submit" 
            :disabled="loading || isSubmitting"
          >
            <Loader2 v-if="loading || isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
            {{ loading || isSubmitting ? t('common.loading') : t('dashboard.accountManagement.changePassword.form.submit') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template> 