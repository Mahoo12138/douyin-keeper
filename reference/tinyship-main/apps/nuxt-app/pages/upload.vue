<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Upload, X, Cloud, Loader2, Check } from 'lucide-vue-next'
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadTrigger,
  FileUploadList,
  FileUploadItem,
  FileUploadItemPreview,
  FileUploadItemMetadata,
  FileUploadItemProgress,
  FileUploadItemDelete,
} from '@/components/ui/file-upload'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type StorageProvider = 'oss' | 's3' | 'r2' | 'cos'

// Maximum file size: 1MB
const MAX_FILE_SIZE = 1 * 1024 * 1024
// Maximum files allowed
const MAX_FILES = 1

interface UploadedFile {
  file: File
  key: string
  url: string
  provider: StorageProvider
}

// Set page layout
definePageMeta({
  layout: 'default'
})

// Set page head information
const { t } = useI18n()
useHead({
  title: t('upload.title'),
  meta: [
    { name: 'description', content: t('upload.description') }
  ]
})

// Reactive state
const files = ref<File[]>([])
const provider = ref<StorageProvider>('oss')
const uploadedFiles = ref<UploadedFile[]>([])
const isUploading = ref(false)

// Provider options
const providerOptions = computed(() => [
  {
    value: 'oss' as const,
    label: t('upload.providers.oss'),
    description: t('upload.providers.ossDescription'),
    colorClass: 'text-chart-1',
  },
  {
    value: 's3' as const,
    label: t('upload.providers.s3'),
    description: t('upload.providers.s3Description'),
    colorClass: 'text-chart-1',
  },
  {
    value: 'r2' as const,
    label: t('upload.providers.r2'),
    description: t('upload.providers.r2Description'),
    colorClass: 'text-chart-1',
  },
  {
    value: 'cos' as const,
    label: t('upload.providers.cos'),
    description: t('upload.providers.cosDescription'),
    colorClass: 'text-chart-1',
  },
])

// Get current provider option
const currentProvider = computed(() => 
  providerOptions.value.find(p => p.value === provider.value)
)

// Validate file
const validateFile = (file: File): string | null => {
  // Validate file type (only images)
  if (!file.type.startsWith('image/')) {
    return t('upload.errors.imageOnly')
  }

  // Validate file size (max 1MB)
  if (file.size > MAX_FILE_SIZE) {
    return t('upload.errors.fileTooLarge')
  }

  return null
}

// Handle file rejection
const handleFileReject = (file: File, message: string) => {
  toast.error(message, {
    description: `"${file.name.length > 20 ? `${file.name.slice(0, 20)}...` : file.name}"`
  })
}

// Handle upload
const handleUpload = async (
  filesToUpload: File[],
  options: {
    onProgress: (file: File, progress: number) => void
    onSuccess: (file: File) => void
    onError: (file: File, error: Error) => void
  }
) => {
  isUploading.value = true

  for (const file of filesToUpload) {
    try {
      await uploadSingleFile(file, options)
    } catch (error) {
      console.error('Upload error:', error)
    }
  }

  isUploading.value = false
}

// Upload single file using XHR for progress tracking
const uploadSingleFile = async (
  file: File,
  options: {
    onProgress: (file: File, progress: number) => void
    onSuccess: (file: File) => void
    onError: (file: File, error: Error) => void
  }
): Promise<void> => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('provider', provider.value)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100)
        options.onProgress(file, progress)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText)
          if (response.success) {
            uploadedFiles.value.push({
              file,
              key: response.data.key,
              url: response.data.url,
              provider: response.data.provider,
            })
            options.onSuccess(file)
            resolve()
          } else {
            const error = new Error(response.error || 'Upload failed')
            options.onError(file, error)
            reject(error)
          }
        } catch {
          const error = new Error('Invalid response from server')
          options.onError(file, error)
          reject(error)
        }
      } else {
        try {
          const errorResponse = JSON.parse(xhr.responseText)
          const error = new Error(errorResponse.error || `Upload failed with status ${xhr.status}`)
          options.onError(file, error)
          reject(error)
        } catch {
          const error = new Error(`Upload failed with status ${xhr.status}`)
          options.onError(file, error)
          reject(error)
        }
      }
    })

    xhr.addEventListener('error', () => {
      const error = new Error('Network error occurred')
      options.onError(file, error)
      reject(error)
    })

    xhr.addEventListener('abort', () => {
      const error = new Error('Upload was cancelled')
      options.onError(file, error)
      reject(error)
    })

    xhr.open('POST', '/api/upload')
    xhr.send(formData)
  })
}

// Handle files change
const handleFilesChange = (newFiles: File[]) => {
  files.value = newFiles
  
  // Clean up uploaded files for removed files
  uploadedFiles.value = uploadedFiles.value.filter(uf => 
    newFiles.includes(uf.file)
  )
}

// Get uploaded file info
const getUploadedFile = (file: File) => {
  return uploadedFiles.value.find(uf => uf.file === file)
}
</script>

<template>
  <div class="container py-8">
    <div class="max-w-2xl mx-auto space-y-6">
      <!-- Page Header -->
      <div class="text-center">
        <h1 class="text-3xl font-bold tracking-tight">
          {{ t('upload.title') }}
        </h1>
        <p class="text-muted-foreground mt-2">
          {{ t('upload.description') }}
        </p>
      </div>

      <!-- Provider Selection Card -->
      <Card>
        <CardHeader>
          <CardTitle class="text-lg">
            {{ t('upload.providerTitle') }}
          </CardTitle>
          <CardDescription>
            {{ t('upload.providerDescription') }}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            v-model="provider"
            :disabled="isUploading"
          >
            <SelectTrigger class="w-full h-auto min-h-[52px]">
              <SelectValue placeholder="Select a provider">
                <div v-if="currentProvider" class="flex items-center gap-3">
                  <Cloud :class="['size-4', currentProvider.colorClass]" />
                  <div class="flex flex-col items-start">
                    <span class="font-medium">{{ currentProvider.label }}</span>
                    <span class="text-xs text-muted-foreground">
                      {{ currentProvider.description }}
                    </span>
                  </div>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in providerOptions"
                :key="option.value"
                :value="option.value"
                class="py-2.5 px-3"
              >
                <div class="flex items-center gap-3">
                  <Cloud :class="['size-4', option.colorClass]" />
                  <div class="flex flex-col items-start">
                    <span class="font-medium">{{ option.label }}</span>
                    <span class="text-xs text-muted-foreground">
                      {{ option.description }}
                    </span>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <!-- File Upload Card -->
      <Card>
        <CardHeader>
          <CardTitle class="text-lg">
            {{ t('upload.uploadTitle') }}
          </CardTitle>
          <CardDescription>
            {{ t('upload.uploadDescription') }}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUpload
            :model-value="files"
            :accept="'image/*'"
            :max-files="MAX_FILES"
            :max-size="MAX_FILE_SIZE"
            :disabled="isUploading"
            :on-upload="handleUpload"
            :on-file-validate="validateFile"
            :on-file-reject="handleFileReject"
            @update:model-value="handleFilesChange"
          >
            <template #default="{ files: fileStates }">
              <!-- Dropzone -->
              <FileUploadDropzone class="min-h-[200px]">
                <template #default="{ isDragging }">
                  <div class="flex flex-col items-center justify-center gap-2">
                    <div
                      :class="[
                        'flex items-center justify-center rounded-full border-2 border-dashed p-4 transition-colors',
                        isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/50'
                      ]"
                    >
                      <Upload class="size-8 text-muted-foreground" />
                    </div>
                    <div class="text-center">
                      <p class="font-medium text-sm">
                        {{ t('upload.dragDrop') }}
                      </p>
                      <p class="text-muted-foreground text-xs mt-1">
                        {{ t('upload.orClick') }}
                      </p>
                    </div>
                    <FileUploadTrigger>
                      <Button
                        variant="outline"
                        size="sm"
                        class="mt-2"
                        :disabled="isUploading || files.length >= MAX_FILES"
                      >
                        {{ t('upload.browseFiles') }}
                      </Button>
                    </FileUploadTrigger>
                  </div>
                </template>
              </FileUploadDropzone>

              <!-- File List -->
              <FileUploadList class="mt-4">
                <template #default="{ files: filesList }">
                  <FileUploadItem
                    v-for="fileState in filesList"
                    :key="fileState.file.name"
                    :file="fileState.file"
                    class="bg-muted/30"
                  >
                    <template #default="{ file, status, progress, error }">
                      <FileUploadItemPreview class="size-12 rounded-md" />
                      <FileUploadItemMetadata class="flex-1" />
                      
                      <!-- Progress bar at bottom -->
                      <FileUploadItemProgress
                        v-if="status === 'uploading'"
                        variant="linear"
                        class="absolute bottom-0 left-0 right-0 h-1 rounded-b-md"
                      />

                      <!-- Status indicators -->
                      <div v-if="status === 'success'" class="flex items-center gap-1 text-primary">
                        <Check class="size-4" />
                        <span class="text-xs">{{ t('upload.uploaded') }}</span>
                      </div>

                      <div v-else-if="status === 'uploading'" class="flex items-center gap-1 text-muted-foreground">
                        <Loader2 class="size-4 animate-spin" />
                        <span class="text-xs">{{ progress }}%</span>
                      </div>

                      <!-- Delete button -->
                      <FileUploadItemDelete>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="size-7"
                          :disabled="status === 'uploading'"
                        >
                          <X class="size-4" />
                        </Button>
                      </FileUploadItemDelete>
                    </template>
                  </FileUploadItem>
                </template>
              </FileUploadList>
            </template>
          </FileUpload>
        </CardContent>
      </Card>

      <!-- Uploaded Files Summary -->
      <Card v-if="uploadedFiles.length > 0">
        <CardHeader>
          <CardTitle class="text-lg flex items-center gap-2">
            <Check class="size-5 text-primary" />
            {{ t('upload.uploadedTitle') }}
          </CardTitle>
          <CardDescription>
            {{ t('upload.uploadedDescription').replace('{count}', uploadedFiles.length.toString()) }}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <div
              v-for="(uploadedFile, index) in uploadedFiles"
              :key="index"
              class="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
            >
              <img
                :src="uploadedFile.url"
                :alt="uploadedFile.file.name"
                class="size-12 rounded-md object-cover"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ uploadedFile.file.name }}
                </p>
                <p class="text-xs text-muted-foreground">
                  Provider: {{ uploadedFile.provider.toUpperCase() }}
                </p>
              </div>
              <a
                :href="uploadedFile.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-primary hover:underline"
              >
                {{ t('upload.viewFile') }}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Upload Status -->
      <div v-if="isUploading" class="flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 class="size-4 animate-spin" />
        <span class="text-sm">{{ t('upload.uploading') }}</span>
      </div>
    </div>
  </div>
</template>
