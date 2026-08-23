<script setup lang="ts">
import { provide, reactive, computed, watch, onUnmounted } from 'vue'
import { cn } from '@/lib/utils'
import type { FileState, FileUploadContext } from './types'
import { FILE_UPLOAD_INJECTION_KEY } from './types'

interface Props {
  class?: string
  modelValue?: File[]
  accept?: string
  maxFiles?: number
  maxSize?: number
  disabled?: boolean
  multiple?: boolean
  onUpload?: (
    files: File[],
    options: {
      onProgress: (file: File, progress: number) => void
      onSuccess: (file: File) => void
      onError: (file: File, error: Error) => void
    }
  ) => Promise<void> | void
  onFileValidate?: (file: File) => string | null | undefined
  onFileReject?: (file: File, message: string) => void
  onFileAccept?: (file: File) => void
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  multiple: false,
  maxFiles: 1,
})

const emit = defineEmits<{
  (e: 'update:modelValue', files: File[]): void
}>()

// State management
const state = reactive({
  files: new Map<File, FileState>(),
  dragOver: false,
  invalid: false,
})

// URL cache for previews
const urlCache = new WeakMap<File, string>()

// Input ref
const inputRef = ref<HTMLInputElement | null>(null)

// Computed file list
const fileList = computed(() => Array.from(state.files.values()))

// Format bytes helper
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${sizes[i]}`
}

// Get file URL for preview
const getFileUrl = (file: File): string => {
  let url = urlCache.get(file)
  if (!url) {
    url = URL.createObjectURL(file)
    urlCache.set(file, url)
  }
  return url
}

// Upload files
const uploadFiles = async (files: File[]) => {
  if (!props.onUpload) {
    // If no upload handler, mark as success immediately
    for (const file of files) {
      const fileState = state.files.get(file)
      if (fileState) {
        fileState.status = 'success'
        fileState.progress = 100
      }
    }
    return
  }

  // Set initial progress
  for (const file of files) {
    const fileState = state.files.get(file)
    if (fileState) {
      fileState.status = 'uploading'
      fileState.progress = 0
    }
  }

  try {
    await props.onUpload(files, {
      onProgress: (file, progress) => {
        const fileState = state.files.get(file)
        if (fileState) {
          fileState.progress = Math.min(Math.max(0, progress), 100)
          fileState.status = 'uploading'
        }
      },
      onSuccess: (file) => {
        const fileState = state.files.get(file)
        if (fileState) {
          fileState.status = 'success'
          fileState.progress = 100
        }
      },
      onError: (file, error) => {
        const fileState = state.files.get(file)
        if (fileState) {
          fileState.status = 'error'
          fileState.error = error.message || 'Upload failed'
        }
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Upload failed'
    for (const file of files) {
      const fileState = state.files.get(file)
      if (fileState) {
        fileState.status = 'error'
        fileState.error = errorMessage
      }
    }
  }
}

// Accept types parsing
const acceptTypes = computed(() => 
  props.accept?.split(',').map(t => t.trim()) ?? null
)

// Validate and add files
const addFiles = (originalFiles: File[]) => {
  if (props.disabled) return

  let filesToProcess = [...originalFiles]
  let invalid = false
  const acceptedFiles: File[] = []

  // Check max files limit
  if (props.maxFiles) {
    const currentCount = state.files.size
    const remainingSlots = Math.max(0, props.maxFiles - currentCount)

    if (remainingSlots < filesToProcess.length) {
      const rejectedFiles = filesToProcess.slice(remainingSlots)
      filesToProcess = filesToProcess.slice(0, remainingSlots)
      invalid = true

      for (const file of rejectedFiles) {
        const message = props.onFileValidate?.(file) || `Maximum ${props.maxFiles} files allowed`
        props.onFileReject?.(file, message)
      }
    }
  }

  // Validate each file
  for (const file of filesToProcess) {
    let rejected = false
    let rejectionMessage = ''

    // Custom validation
    if (props.onFileValidate) {
      const validationMessage = props.onFileValidate(file)
      if (validationMessage) {
        rejectionMessage = validationMessage
        props.onFileReject?.(file, rejectionMessage)
        rejected = true
        invalid = true
        continue
      }
    }

    // Type validation
    if (acceptTypes.value) {
      const fileType = file.type
      const fileExtension = `.${file.name.split('.').pop()}`

      const isAccepted = acceptTypes.value.some(type =>
        type === fileType ||
        type === fileExtension ||
        (type.includes('/*') && fileType.startsWith(type.replace('/*', '/')))
      )

      if (!isAccepted) {
        rejectionMessage = 'File type not accepted'
        props.onFileReject?.(file, rejectionMessage)
        rejected = true
        invalid = true
        continue
      }
    }

    // Size validation
    if (props.maxSize && file.size > props.maxSize) {
      rejectionMessage = 'File too large'
      props.onFileReject?.(file, rejectionMessage)
      rejected = true
      invalid = true
      continue
    }

    if (!rejected) {
      acceptedFiles.push(file)
    }
  }

  // Show invalid state briefly
  if (invalid) {
    state.invalid = true
    setTimeout(() => {
      state.invalid = false
    }, 2000)
  }

  // Add accepted files to state
  if (acceptedFiles.length > 0) {
    for (const file of acceptedFiles) {
      state.files.set(file, {
        file,
        progress: 0,
        status: 'idle',
      })
      props.onFileAccept?.(file)
    }

    // Emit update
    const fileArray = Array.from(state.files.values()).map(f => f.file)
    emit('update:modelValue', fileArray)

    // Auto-upload
    nextTick(() => {
      uploadFiles(acceptedFiles)
    })
  }
}

// Remove file
const removeFile = (file: File) => {
  const cachedUrl = urlCache.get(file)
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl)
  }
  
  state.files.delete(file)
  
  const fileArray = Array.from(state.files.values()).map(f => f.file)
  emit('update:modelValue', fileArray)
}

// Clear all files
const clearAll = () => {
  for (const file of state.files.keys()) {
    const cachedUrl = urlCache.get(file)
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl)
    }
  }
  
  state.files.clear()
  state.invalid = false
  emit('update:modelValue', [])
}

// Handle input change
const onInputChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files) {
    addFiles(Array.from(input.files))
  }
  input.value = ''
}

// Open file dialog
const openFileDialog = () => {
  inputRef.value?.click()
}

// Set drag over state
const setDragOver = (value: boolean) => {
  state.dragOver = value
}

// Sync with v-model
watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    const newFileSet = new Set(newValue)
    
    // Remove files not in new value
    for (const existingFile of state.files.keys()) {
      if (!newFileSet.has(existingFile)) {
        const cachedUrl = urlCache.get(existingFile)
        if (cachedUrl) {
          URL.revokeObjectURL(cachedUrl)
        }
        state.files.delete(existingFile)
      }
    }
    
    // Add new files
    for (const file of newValue) {
      if (!state.files.has(file)) {
        state.files.set(file, {
          file,
          progress: 0,
          status: 'idle',
        })
      }
    }
  }
}, { immediate: true })

// Cleanup on unmount
onUnmounted(() => {
  for (const file of state.files.keys()) {
    const cachedUrl = urlCache.get(file)
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl)
    }
  }
})

// Provide context
const context: FileUploadContext = {
  state,
  inputRef,
  disabled: computed(() => props.disabled),
  accept: computed(() => props.accept),
  multiple: computed(() => props.multiple),
  addFiles,
  removeFile,
  clearAll,
  openFileDialog,
  setDragOver,
  getFileUrl,
  formatBytes,
}

provide(FILE_UPLOAD_INJECTION_KEY, context)
</script>

<template>
  <div
    data-slot="file-upload"
    :data-disabled="disabled ? '' : undefined"
    :class="cn('relative flex flex-col gap-2', props.class)"
  >
    <slot :files="fileList" :disabled="disabled" />
    
    <!-- Hidden file input -->
    <input
      ref="inputRef"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      class="sr-only"
      @change="onInputChange"
    />
  </div>
</template>
