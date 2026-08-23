<template>
  <Alert v-if="message" variant="destructive" class="mb-6">
    <ExclamationTriangleIcon class="h-4 w-4" />
    <AlertDescription>
      <span>{{ message }} {{ code ? `- ${code}` : '' }}</span>
      <Button
        v-if="showResendButton"
        type="button"
        variant="outline"
        size="sm"
                  @click="onResendClick"
        class="mx-auto mt-2"
      >
        {{ $t('actions.resendVerificationEmail') }}
      </Button>
    </AlertDescription>
  </Alert>
</template>

<script setup lang="ts">
// Import icon component (using lucide-vue-next)
import { AlertTriangle as ExclamationTriangleIcon } from 'lucide-vue-next'

interface Props {
  message?: string
  code?: string
  onResendClick?: () => void
  userEmail?: string
}

const props = defineProps<Props>()

const showResendButton = computed(() => 
  props.code === 'EMAIL_NOT_VERIFIED' && props.userEmail && props.onResendClick
)
</script> 