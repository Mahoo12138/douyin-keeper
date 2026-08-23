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
const { deleteAccountSchema } = createValidators(t)

// Form validation using vee-validate
const { handleSubmit, errors, defineField, isSubmitting, resetForm } = useForm({
  validationSchema: deleteAccountSchema,
  initialValues: {
    confirm: false
  }
})

// Define form fields with validation
const [confirm, confirmAttrs] = defineField('confirm', {
  validateOnBlur: true
})

/**
 * Submit form to delete account
 */
const onSubmit = handleSubmit(async (values) => {
  loading.value = true
  
  const { data, error } = await authClientVue.deleteUser()
  
  if (error) {
    console.error('Failed to delete account:', error)
    toast.error(error.message || t('dashboard.accountManagement.deleteAccount.errors.failed'))
    loading.value = false
    return
  }
  
  // Show success message
  toast.success(t('dashboard.accountManagement.deleteAccount.success'))
  
  // Reset form and close dialog
  resetForm()
  emit('update:open', false)
  
  // Redirect to home page or sign out the user
  await navigateTo('/')
  
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
        <DialogTitle class="text-destructive">
          {{ t('dashboard.accountManagement.deleteAccount.confirmTitle') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('dashboard.accountManagement.deleteAccount.confirmDescription') }}
        </DialogDescription>
      </DialogHeader>
      
      <!-- Warning section -->
      <div class="space-y-4">
        <div class="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
          <div class="text-destructive font-medium mb-2">
            {{ t('dashboard.accountManagement.deleteAccount.warning') }}
          </div>
          <ul class="text-sm text-muted-foreground space-y-1">
            <li>• {{ t('dashboard.accountManagement.deleteAccount.consequences.data') }}</li>
            <li>• {{ t('dashboard.accountManagement.deleteAccount.consequences.subscriptions') }}</li>
            <li>• {{ t('dashboard.accountManagement.deleteAccount.consequences.access') }}</li>
          </ul>
        </div>
        
        <!-- Confirmation form -->
        <form @submit.prevent="onSubmit" class="space-y-4">
          <div class="flex items-center space-x-2">
            <input
              id="confirm-delete"
              v-bind="confirmAttrs"
              v-model="confirm"
              type="checkbox"
              :class="cn(
                'h-4 w-4 rounded border border-primary text-primary ring-offset-background',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                errors.confirm && 'border-destructive'
              )"
              :aria-invalid="errors.confirm ? 'true' : 'false'"
            />
            <Label for="confirm-delete" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              {{ t('dashboard.accountManagement.deleteAccount.form.confirm') }}
            </Label>
          </div>
          
          <span v-if="errors.confirm" class="text-destructive text-xs">
            {{ errors.confirm }}
          </span>
          
          <DialogFooter class="gap-2">
            <Button type="button" variant="outline" @click="handleCancel">
              {{ t('dashboard.accountManagement.deleteAccount.form.cancel') }}
            </Button>
            <Button 
              type="submit" 
              variant="destructive"
              :disabled="loading || isSubmitting || !confirm"
            >
              <Loader2 v-if="loading || isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              {{ loading || isSubmitting ? t('common.loading') : t('dashboard.accountManagement.deleteAccount.form.confirm') }}
            </Button>
          </DialogFooter>
        </form>
      </div>
    </DialogContent>
  </Dialog>
</template> 