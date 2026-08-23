<template>
  <div class="container mx-auto py-10 px-5">
    <!-- Back link -->
    <div class="flex items-center mb-6">
      <NuxtLink to="/admin/blog" class="text-primary hover:text-primary/80">
        ← {{ t('actions.backToBlog') }}
      </NuxtLink>
    </div>

    <!-- Page title -->
    <h1 class="text-3xl font-bold mb-6">
      {{ isEditMode ? t('admin.blog.editPost') : t('admin.blog.createPost') }}
    </h1>

    <!-- Error message -->
    <div v-if="errorMessage" class="mb-4 p-4 text-destructive bg-destructive/10 rounded-md">
      {{ errorMessage }}
    </div>

    <!-- Loading skeleton -->
    <div v-if="pending" class="max-w-5xl mx-auto">
      <Card>
        <CardHeader>
          <Skeleton class="h-7 w-40 mb-2" />
          <Skeleton class="h-4 w-60" />
        </CardHeader>
        <CardContent class="space-y-4">
          <div v-for="i in 6" :key="i" class="space-y-2">
            <Skeleton class="h-5 w-24" />
            <Skeleton class="h-10 w-full" />
          </div>
        </CardContent>
        <CardFooter class="pt-6">
          <Skeleton class="h-10 w-32" />
        </CardFooter>
      </Card>
    </div>

    <!-- Form -->
    <form v-else @submit.prevent="onSubmit" class="max-w-5xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{{ t('admin.blog.form.title') }}</CardTitle>
          <CardDescription>{{ t('admin.blog.form.description') }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- Title field -->
          <div class="space-y-2">
            <Label for="title">{{ t('admin.blog.form.labels.title') }}</Label>
            <Input
              id="title"
              v-model="title"
              :placeholder="t('admin.blog.form.placeholders.title')"
              @input="autoGenerateSlug"
            />
          </div>

          <!-- Slug field -->
          <div class="space-y-2">
            <Label for="slug">{{ t('admin.blog.form.labels.slug') }}</Label>
            <Input
              id="slug"
              v-model="slug"
              :placeholder="t('admin.blog.form.placeholders.slug')"
            />
          </div>

          <!-- Excerpt field -->
          <div class="space-y-2">
            <Label for="excerpt">{{ t('admin.blog.form.labels.excerpt') }}</Label>
            <textarea
              id="excerpt"
              v-model="excerpt"
              :placeholder="t('admin.blog.form.placeholders.excerpt')"
              class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              rows="3"
            />
          </div>

          <!-- Cover image field -->
          <div class="space-y-2">
            <Label for="coverImage">{{ t('admin.blog.form.labels.coverImage') }}</Label>
            <!-- Show current cover image preview if exists -->
            <div v-if="coverImage" class="relative mb-2">
              <img
                :src="coverImage"
                alt="Cover"
                class="w-full h-48 object-cover rounded-md border"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                class="absolute top-2 right-2"
                @click="coverImage = ''"
              >
                {{ t('actions.delete') }}
              </Button>
            </div>
            <FileUpload
              v-if="!coverImage"
              :model-value="[]"
              accept="image/*"
              :max-files="1"
              :max-size="2 * 1024 * 1024"
              :on-upload="uploadCoverImage"
            >
              <FileUploadDropzone class="border-dashed p-6">
                <div class="flex flex-col items-center gap-2 text-center">
                  <Upload class="h-8 w-8 text-muted-foreground" />
                  <p class="text-sm text-muted-foreground">
                    {{ t('admin.blog.form.placeholders.coverImage') }}
                  </p>
                </div>
              </FileUploadDropzone>
            </FileUpload>
          </div>

          <!-- Status field -->
          <div class="space-y-2">
            <Label for="status">{{ t('admin.blog.form.labels.status') }}</Label>
            <Select v-model="status">
              <SelectTrigger>
                <SelectValue :placeholder="t('admin.blog.form.labels.status')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{{ t('admin.blog.table.search.draft') }}</SelectItem>
                <SelectItem value="published">{{ t('admin.blog.table.search.published') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Content field (Markdown editor) -->
          <div class="space-y-2">
            <Label for="content">{{ t('admin.blog.form.labels.content') }}</Label>
            <ClientOnly>
              <MdEditor v-model="content" language="en-US" class="min-h-[400px]" :on-upload-img="handleEditorUploadImg" />
              <template #fallback>
                <div class="min-h-[400px] rounded-md border border-input bg-muted/50 flex items-center justify-center text-muted-foreground">
                  {{ t('common.loading') }}
                </div>
              </template>
            </ClientOnly>
          </div>
        </CardContent>
        <CardFooter class="flex justify-between space-x-4 pt-6">
          <div class="flex space-x-4">
            <Button type="submit" :disabled="isSubmitting" class="flex items-center gap-2">
              <Save class="h-4 w-4" />
              {{ isSubmitting ? t('common.loading') : t('actions.saveChanges') }}
            </Button>

            <!-- Delete button (only for edit mode) -->
            <AlertDialog v-if="isEditMode">
              <AlertDialogTrigger as-child>
                <Button variant="destructive" type="button" class="flex items-center gap-2">
                  <Trash2 class="h-4 w-4" />
                  {{ t('actions.deletePost') }}
                </Button>
              </AlertDialogTrigger>
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
                    @click="handleDelete"
                    class="bg-destructive hover:bg-destructive/90"
                  >
                    {{ t('actions.delete') }}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardFooter>
      </Card>
    </form>
  </div>
</template>

<script setup lang="ts">
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { Save, Trash2, Upload } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { createBlogPostValidators } from '@libs/validators'

definePageMeta({
  layout: 'admin',
})

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()

const { blogPostFormSchema } = createBlogPostValidators(t)

const postId = route.params.id as string
const isEditMode = postId !== 'new'

const title = ref('')
const slug = ref('')
const excerpt = ref('')
const coverImage = ref('')
const status = ref<'draft' | 'published'>('draft')
const content = ref('')

const pending = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')

/** Generate URL-friendly slug from title */
function generateSlugFromTitle(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'post'
}

const autoGenerateSlug = () => {
  if (title.value.trim()) {
    slug.value = generateSlugFromTitle(title.value)
  }
}

/** Upload cover image via storage API; adapts to FileUpload onUpload signature */
const uploadCoverImage = async (
  files: File[],
  options: {
    onProgress: (file: File, progress: number) => void
    onSuccess: (file: File) => void
    onError: (file: File, error: Error) => void
  }
) => {
  const file = files[0]
  if (!file) return
  const formData = new FormData()
  formData.append('file', file)
  formData.append('provider', 'r2')
  try {
    const res = await $fetch<{ data: { url: string } }>('/api/upload', {
      method: 'POST',
      body: formData,
    })
    coverImage.value = res.data?.url || ''
    toast.success(t('admin.blog.messages.uploadSuccess'))
    options.onSuccess(file)
  } catch (err) {
    toast.error(t('admin.blog.messages.uploadError'))
    options.onError(file, err instanceof Error ? err : new Error(String(err)))
  }
}

/** Handle image upload from markdown editor (paste/drag) */
const handleEditorUploadImg = async (files: File[], callback: (urls: string[]) => void) => {
  const urls: string[] = []
  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('provider', 'r2')
    try {
      const res = await $fetch<{ data: { url: string } }>('/api/upload', {
        method: 'POST',
        body: formData,
      })
      if (res.data?.url) {
        urls.push(res.data.url)
      }
    } catch {
      toast.error(t('admin.blog.messages.uploadError'))
    }
  }
  callback(urls)
}

// Fetch post data for edit mode
if (isEditMode) {
  const { data } = await useFetch(`/api/admin/blog/${postId}`, {
    server: false,
    onRequest() {
      pending.value = true
    },
    onResponse({ response }) {
      pending.value = false
      const row = response._data
      if (row) {
        title.value = row.title || ''
        slug.value = row.slug || ''
        excerpt.value = row.excerpt || ''
        coverImage.value = row.coverImage || ''
        status.value = (row.status as 'draft' | 'published') || 'draft'
        content.value = row.content || ''
      }
    },
    onResponseError() {
      pending.value = false
      errorMessage.value = t('admin.blog.messages.fetchError')
    },
  })
}

const onSubmit = async () => {
  isSubmitting.value = true
  errorMessage.value = ''

  const body = {
    title: title.value.trim(),
    slug: slug.value.trim() || generateSlugFromTitle(title.value),
    excerpt: excerpt.value.trim() || undefined,
    coverImage: coverImage.value.trim() || undefined,
    status: status.value,
    content: content.value,
  }

  const parseResult = blogPostFormSchema.safeParse(body)
  if (!parseResult.success) {
    const firstError = parseResult.error.issues?.[0]?.message || t('admin.blog.messages.operationFailed')
    errorMessage.value = firstError
    toast.error(firstError)
    isSubmitting.value = false
    return
  }

  try {
    if (isEditMode) {
      await $fetch(`/api/admin/blog/${postId}`, {
        method: 'PATCH',
        body,
      })
      toast.success(t('admin.blog.messages.updateSuccess'))
    } else {
      await $fetch('/api/admin/blog', {
        method: 'POST',
        body,
      })
      toast.success(t('admin.blog.messages.createSuccess'))
    }

    await router.push(localePath('/admin/blog'))
  } catch (error: any) {
    const message = error?.data?.message || t('admin.blog.messages.operationFailed')
    errorMessage.value = message
    toast.error(message)
  } finally {
    isSubmitting.value = false
  }
}

const handleDelete = async () => {
  try {
    await $fetch(`/api/admin/blog/${postId}`, { method: 'DELETE' })
    toast.success(t('admin.blog.messages.deleteSuccess'))
    await router.push(localePath('/admin/blog'))
  } catch (error: any) {
    const message = error?.data?.message || t('admin.blog.messages.deleteError')
    errorMessage.value = message
    toast.error(message)
  }
}

useHead({
  title: computed(() =>
    isEditMode ? t('admin.blog.editPost') : t('admin.blog.createPost'),
  ),
})
</script>
