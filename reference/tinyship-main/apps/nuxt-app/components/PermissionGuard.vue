<template>
  <div>
    <!-- Show content if user has permission -->
    <slot v-if="hasPermission" />
    
    <!-- Show fallback content if user doesn't have permission -->
    <slot v-else name="fallback">
      <div class="text-center text-muted-foreground py-4">
        <p>{{ $t('errors.accessDenied') || 'Access denied' }}</p>
      </div>
    </slot>
  </div>
</template>

<script setup lang="ts">
import { Action, Subject } from '@libs/permissions'
import { usePermission } from '@/composables/usePermissions'

interface Props {
  action: Action
  subject: Subject
  data?: any
  showFallback?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showFallback: true
})

// Get current user
const { user } = useAuth()

// Check permission
const hasPermission = usePermission(user, props.action, props.subject, props.data)
</script>

<!--
Usage Examples:

1. Basic usage - hide content if no permission:
<PermissionGuard :action="Action.READ" :subject="Subject.ADMIN_PANEL">
  <AdminDashboard />
</PermissionGuard>

2. With custom fallback content:
<PermissionGuard :action="Action.UPDATE" :subject="Subject.USER" :data="{ id: userId }">
  <UserEditForm />
  <template #fallback>
    <div class="bg-yellow-50 border border-yellow-200 rounded-md p-4">
      <p class="text-yellow-800">You can only edit your own profile.</p>
    </div>
  </template>
</PermissionGuard>

3. Instance-specific permission (e.g., can edit this specific article):
<PermissionGuard :action="Action.UPDATE" :subject="Subject.ARTICLE" :data="article">
  <EditArticleButton />
</PermissionGuard>

4. Admin-only content:
<PermissionGuard :action="Action.MANAGE" :subject="Subject.ALL">
  <AdminSettings />
  <template #fallback>
    <p>Administrator access required.</p>
  </template>
</PermissionGuard>

5. No fallback (content just disappears):
<PermissionGuard :action="Action.DELETE" :subject="Subject.COMMENT" :show-fallback="false">
  <DeleteButton />
</PermissionGuard>
--> 