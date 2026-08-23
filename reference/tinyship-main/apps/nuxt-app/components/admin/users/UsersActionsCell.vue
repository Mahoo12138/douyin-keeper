<script setup lang="ts">
import { ref } from 'vue'
import { MoreHorizontal, Edit, Trash2, User, Ban, UserCheck } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { authClientVue } from '@libs/auth/authClient'
import { toast } from 'vue-sonner'

interface User {
  id: string
  name: string | null
  email: string
  role: string
  emailVerified: boolean
  banned: boolean | null
  createdAt: string | Date
  updatedAt: string | Date
}

defineProps<{
  user: User
}>()

// Emit events to parent component
const emit = defineEmits<{
  'user-updated': [userUpdate: Partial<User> & { id: string }]
  'user-deleted': [userId: string]
}>()

const { t } = useI18n()
const banDialogOpen = ref(false)
const deleteDialogOpen = ref(false)

// Loading states
const banLoading = ref(false)
const deleteLoading = ref(false)

// Handle ban/unban user
const handleToggleBan = async (user: User) => {
  if (banLoading.value) return
  
  banLoading.value = true
  
  const { data, error } = await (user.banned 
    ? authClientVue.admin.unbanUser({ userId: user.id })
    : authClientVue.admin.banUser({ 
        userId: user.id, 
        banReason: 'Banned by admin' 
      })
  )
  
  if (error) {
    console.error('Error toggling ban status:', error)
    toast.error(error.message || t('admin.users.messages.operationFailed'))
    banLoading.value = false
    return
  }
  
  toast.success(user.banned 
    ? t('admin.users.table.dialog.unbanSuccess')
    : t('admin.users.table.dialog.banSuccess')
  )
  
  // Close dialog and emit event to parent
  banDialogOpen.value = false
  
  // Emit only the changed properties - more efficient
  emit('user-updated', { 
    id: user.id, 
    banned: !user.banned 
  })
  
  banLoading.value = false
}

// Handle delete user
const handleDeleteUser = async (user: User) => {
  if (deleteLoading.value) return
  
  deleteLoading.value = true
  
  const { data, error } = await authClientVue.admin.removeUser({
    userId: user.id,
  })
  
  if (error) {
    console.error('Error deleting user:', error)
    toast.error(error.message || t('admin.users.messages.deleteError'))
    deleteLoading.value = false
    return
  }
  
  toast.success(t('admin.users.messages.deleteSuccess'))
  
  // Close dialog and emit event to parent
  deleteDialogOpen.value = false
  
  // Emit deleted user ID
  emit('user-deleted', user.id)
  
  deleteLoading.value = false
}
</script>

<template>
  <div>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" class="w-8 h-8 p-0">
        <span class="sr-only">Open menu</span>
        <MoreHorizontal class="w-4 h-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">      
      <!-- Edit user -->
      <DropdownMenuItem @click="navigateTo(`/admin/users/${user.id}`)">
        <Edit class="mr-2 h-4 w-4" />
        <span>{{ t('admin.users.table.actions.editUser') }}</span>
      </DropdownMenuItem>
      <DropdownMenuItem  @click="banDialogOpen = true">
        <UserCheck v-if="user.banned" class="mr-2 h-4 w-4" />
        <Ban v-else class="mr-2 h-4 w-4" />
        <span>{{ user.banned ? t('admin.users.actions.unbanUser') : t('admin.users.actions.banUser') }}</span>
      </DropdownMenuItem>
      
      <DropdownMenuSeparator />
      <DropdownMenuItem @click="deleteDialogOpen = true" class="text-destructive">
        <Trash2 class="mr-2 h-4 w-4" />
        <span>{{ t('admin.users.table.actions.deleteUser') }}</span>
      </DropdownMenuItem>

    </DropdownMenuContent>
  </DropdownMenu>
  <!-- Toggle ban status with AlertDialog -->
  <AlertDialog v-model:open="banDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ user.banned ? t('admin.users.unbanDialog.title') : t('admin.users.banDialog.title') }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ user.banned 
            ? t('admin.users.unbanDialog.description', { userName: user.name || user.email })
            : t('admin.users.banDialog.description', { userName: user.name || user.email })
          }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('actions.cancel') }}</AlertDialogCancel>
        <AlertDialogAction 
          :disabled="banLoading"
          @click="handleToggleBan(user)"
        >
          <span v-if="banLoading" class="mr-2">⏳</span>
          {{ user.banned ? t('admin.users.actions.unbanUser') : t('admin.users.actions.banUser') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  <!-- Delete user with AlertDialog -->
  <AlertDialog v-model:open="deleteDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('admin.users.deleteDialog.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('admin.users.deleteDialog.description', { userName: user.name || user.email }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('actions.cancel') }}</AlertDialogCancel>
        <AlertDialogAction 
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          :disabled="deleteLoading"
          @click="handleDeleteUser(user)"
        >
          <span v-if="deleteLoading" class="mr-2">⏳</span>
          {{ t('admin.users.table.actions.deleteUser') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
</template> 