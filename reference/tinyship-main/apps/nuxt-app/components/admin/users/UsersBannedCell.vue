<template>
  <div class="flex items-center">
    <Switch 
      :model-value="checked" 
      :disabled="loading"
      @update:model-value="handleSwitchChange"
    />
  </div>
  
  <AlertDialog v-model:open="isOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ $t('admin.users.table.dialog.banTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t('admin.users.table.dialog.banDescription') }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="loading">{{ $t('actions.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click.prevent="handleConfirm" :disabled="loading">
          {{ loading ? $t('common.loading') : $t('actions.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { authClientVue } from '@libs/auth/authClient'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'

interface Props {
  value: boolean
  userId: string
  onUserUpdated?: (update: { id: string; banned: boolean }) => void
}

const props = defineProps<Props>()

const { t } = useI18n()
const isOpen = ref(false)
const checked = ref(props.value)
const loading = ref(false)

// Watch props.value changes to sync local state
watch(() => props.value, (newValue) => {
  checked.value = newValue
})

const handleSwitchChange = (newValue: boolean) => {
  if (loading.value) return // Prevent action while loading
  
  // If trying to ban (newValue = true, current is false)
  if (newValue && !checked.value) {
    // Opening ban dialog - don't update checked yet
    isOpen.value = true
  } 
  // If trying to unban (newValue = false, current is true)
  else if (!newValue && checked.value) {
    // Directly unban without confirmation
    handleConfirm()
  }
}

const handleConfirm = async () => {
  if (loading.value) return // Prevent duplicate clicks
  
  loading.value = true
  const targetAction = !checked.value // Capture the action before state changes
  
  try {
    const { data, error } = await (targetAction
      ? authClientVue.admin.banUser({
          userId: props.userId,
          banReason: 'No reason provided',
        })
      : authClientVue.admin.unbanUser({
          userId: props.userId,
        })
    )

    if (error) {
      toast.error(error.message || t('admin.users.messages.operationFailed'))
      console.error('Error updating user status:', error)
      return
    }

    // Close dialog first
    isOpen.value = false
    
    // Update local table data immediately
    if (props.onUserUpdated) {
      const newBannedState = targetAction // targetAction is true for ban, false for unban
      props.onUserUpdated({ 
        id: props.userId, 
        banned: newBannedState
      })
    }
    
    // Show success message
    toast.success(targetAction ? t('admin.users.table.dialog.banSuccess') : t('admin.users.table.dialog.unbanSuccess'))
  } finally {
    loading.value = false
  }
}
</script>

