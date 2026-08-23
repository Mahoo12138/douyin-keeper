<script setup lang="ts">
import { cn } from '@/lib/utils'
import { useFileUploadContext } from './types'

interface Props {
  class?: string
}

const props = defineProps<Props>()

const context = useFileUploadContext()

const handleDragEnter = (e: DragEvent) => {
  if (context.disabled.value) return
  e.preventDefault()
  e.stopPropagation()
  context.setDragOver(true)
}

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  
  // Check if leaving to a child element
  const relatedTarget = e.relatedTarget
  if (
    relatedTarget &&
    relatedTarget instanceof Node &&
    (e.currentTarget as Element).contains(relatedTarget)
  ) {
    return
  }
  
  context.setDragOver(false)
}

const handleDragOver = (e: DragEvent) => {
  if (context.disabled.value) return
  e.preventDefault()
  e.stopPropagation()
  context.setDragOver(true)
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  context.setDragOver(false)
  
  if (context.disabled.value) return
  
  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length > 0) {
    context.addFiles(files)
  }
}

const handleClick = (e: MouseEvent) => {
  if (context.disabled.value) return
  
  // Don't trigger if clicking on a trigger button
  const target = e.target as HTMLElement
  if (target.closest('[data-slot="file-upload-trigger"]')) {
    return
  }
  
  context.openFileDialog()
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (context.disabled.value) return
  
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    context.openFileDialog()
  }
}

const handlePaste = (e: ClipboardEvent) => {
  if (context.disabled.value) return
  
  e.preventDefault()
  const items = e.clipboardData?.items
  if (!items) return
  
  const files: File[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item?.kind === 'file') {
      const file = item.getAsFile()
      if (file) {
        files.push(file)
      }
    }
  }
  
  if (files.length > 0) {
    context.addFiles(files)
  }
}
</script>

<template>
  <div
    role="region"
    data-slot="file-upload-dropzone"
    :data-disabled="context.disabled.value ? '' : undefined"
    :data-dragging="context.state.dragOver ? '' : undefined"
    :data-invalid="context.state.invalid ? '' : undefined"
    :tabindex="context.disabled.value ? undefined : 0"
    :class="cn(
      'relative flex select-none flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 outline-none transition-colors',
      'hover:bg-accent/30 focus-visible:border-ring/50',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      'data-[dragging]:border-primary/50 data-[dragging]:bg-accent/30',
      'data-[invalid]:border-destructive data-[invalid]:ring-destructive/20',
      props.class
    )"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @dragover="handleDragOver"
    @drop="handleDrop"
    @click="handleClick"
    @keydown="handleKeyDown"
    @paste="handlePaste"
  >
    <slot :is-dragging="context.state.dragOver" />
  </div>
</template>

