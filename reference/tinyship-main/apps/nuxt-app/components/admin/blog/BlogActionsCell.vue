<script setup lang="ts">
import { ref } from 'vue'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
} from '@/components/ui/alert-dialog'
import { toast } from 'vue-sonner'

interface BlogPost {
  id: string
  title: string
}

const props = defineProps<{
  post: BlogPost
  onPostDeleted?: (id: string) => void
}>()

const emit = defineEmits<{
  'post-deleted': [postId: string]
}>()

const { t } = useI18n()
const deleteDialogOpen = ref(false)
const deleteLoading = ref(false)

const handleDelete = async (post: BlogPost) => {
  if (deleteLoading.value) return

  deleteLoading.value = true

  try {
    await $fetch(`/api/admin/blog/${post.id}`, { method: 'DELETE' })
    toast.success(t('admin.blog.messages.deleteSuccess'))
    deleteDialogOpen.value = false
    emit('post-deleted', post.id)
    props.onPostDeleted?.(post.id)
  } catch (error: any) {
    toast.error(error?.data?.message || t('admin.blog.messages.deleteError'))
  } finally {
    deleteLoading.value = false
  }
}
</script>

<template>
  <div class="flex justify-end">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" class="h-8 w-8 p-0">
          <span class="sr-only">{{ t('admin.blog.table.actions.edit') }}</span>
          <MoreHorizontal class="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem @click="navigateTo(`/admin/blog/${post.id}`)">
          <Pencil class="mr-2 h-4 w-4" />
          {{ t('admin.blog.table.actions.edit') }}
        </DropdownMenuItem>
        <DropdownMenuItem
          class="text-destructive focus:text-destructive"
          @click="deleteDialogOpen = true"
        >
          <Trash2 class="mr-2 h-4 w-4" />
          {{ t('admin.blog.table.actions.delete') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('admin.blog.deleteDialog.title') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('admin.blog.deleteDialog.description') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('actions.cancel') }}</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            :disabled="deleteLoading"
            @click="handleDelete(post)"
          >
            <span v-if="deleteLoading" class="mr-2">⏳</span>
            {{ t('actions.delete') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
