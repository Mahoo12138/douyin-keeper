<template>
  <Select v-model="selectedRole" @update:model-value="handleRoleChange">
    <SelectTrigger class="w-[100px]">
      <SelectValue :placeholder="$t('admin.users.form.placeholders.selectRole')" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem :value="userRoles.ADMIN">{{ userRoles.ADMIN }}</SelectItem>
      <SelectItem :value="userRoles.USER">{{ userRoles.USER }}</SelectItem>
    </SelectContent>
  </Select>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { authClientVue } from '@libs/auth/authClient'
import { userRoles, type UserRole } from '@libs/database/constants'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  currentRole: string
  userId: string
  onUserUpdated?: (update: { id: string; role: string }) => void
}

const props = defineProps<Props>()

const { t } = useI18n()
const selectedRole = ref(props.currentRole)

// Watch props.currentRole changes to sync local state
watch(() => props.currentRole, (newRole) => {
  selectedRole.value = newRole
})

const handleRoleChange = async (newRole: unknown) => {
  if (typeof newRole !== 'string' || !newRole) {
    return
  }
  const { data, error } = await authClientVue.admin.setRole({
    userId: props.userId,
    role: newRole as UserRole,
  })

  if (error) {
    toast.error(error.message || t('admin.users.table.dialog.updateRoleFailed'))
    console.error('Error updating user role:', error)
    // Revert the selection
    selectedRole.value = props.currentRole
    return
  }

  // Update local table data immediately
  if (props.onUserUpdated) {
    props.onUserUpdated({ 
      id: props.userId, 
      role: newRole
    })
  }
  
  toast.success(t('admin.users.table.dialog.updateRoleSuccess'))
}
</script>

