import type { InjectionKey, Ref, ComputedRef } from 'vue'

export interface FileState {
  file: File
  progress: number
  status: 'idle' | 'uploading' | 'success' | 'error'
  error?: string
}

export interface FileUploadState {
  files: Map<File, FileState>
  dragOver: boolean
  invalid: boolean
}

export interface FileUploadContext {
  state: FileUploadState
  inputRef: Ref<HTMLInputElement | null>
  disabled: ComputedRef<boolean>
  accept: ComputedRef<string | undefined>
  multiple: ComputedRef<boolean>
  addFiles: (files: File[]) => void
  removeFile: (file: File) => void
  clearAll: () => void
  openFileDialog: () => void
  setDragOver: (value: boolean) => void
  getFileUrl: (file: File) => string
  formatBytes: (bytes: number) => string
}

export const FILE_UPLOAD_INJECTION_KEY: InjectionKey<FileUploadContext> = Symbol('file-upload')

export function useFileUploadContext() {
  const context = inject(FILE_UPLOAD_INJECTION_KEY)
  if (!context) {
    throw new Error('FileUpload components must be used within a FileUpload component')
  }
  return context
}

// FileUploadItem context
export interface FileUploadItemContext {
  file: File
  fileState: () => FileState | undefined
}

export const FILE_UPLOAD_ITEM_KEY: InjectionKey<FileUploadItemContext> = Symbol('file-upload-item')

export function useFileUploadItemContext() {
  const context = inject(FILE_UPLOAD_ITEM_KEY)
  if (!context) {
    throw new Error('FileUploadItem child components must be used within a FileUploadItem component')
  }
  return context
}

