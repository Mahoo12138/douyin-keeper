<template>
  <div class="container mx-auto py-10 px-5">
    <!-- Back link -->
    <div class="flex items-center mb-6">
      <NuxtLink to="/admin/users" class="text-primary hover:text-primary/80">
        ← {{ t('actions.backToList') }}
      </NuxtLink>
    </div>

    <!-- Page title -->
    <h1 class="text-3xl font-bold mb-6">
      {{ isEditMode ? t('admin.users.editUser') : t('admin.users.createUser') }}
    </h1>

    <!-- Error message -->
    <div v-if="errorMessage" class="mb-4 p-4 text-destructive bg-destructive/10 rounded-md">
      {{ errorMessage }}
    </div>

    <!-- Loading skeleton -->
    <div v-if="pending" class="max-w-2xl mx-auto">
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
    <form v-else @submit="onSubmit" class="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{{ t('admin.users.form.title') }}</CardTitle>
          <CardDescription>{{ t('admin.users.form.description') }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- Name field -->
          <div class="space-y-2">
            <Label for="name">{{ t('admin.users.form.labels.name') }}</Label>
            <Input 
              id="name"
              v-bind="nameAttrs"
              v-model="name"
              :placeholder="t('admin.users.form.placeholders.name')"
              :class="errors.name ? 'border-destructive' : ''"
            />
            <p v-if="errors.name" class="text-destructive text-sm">{{ errors.name }}</p>
          </div>
          
          <!-- Email field -->
          <div class="space-y-2">
            <Label for="email">{{ t('admin.users.form.labels.email') }}</Label>
            <Input 
              id="email"
              type="email"
              v-bind="emailAttrs"
              v-model="email"
              :disabled="isEditMode"
              :placeholder="t('admin.users.form.placeholders.email')"
              :class="errors.email ? 'border-destructive' : ''"
            />
            <p v-if="errors.email" class="text-destructive text-sm">{{ errors.email }}</p>
          </div>
          
          <!-- Password field (only for new users) -->
          <div v-if="!isEditMode" class="space-y-2">
            <Label for="password">{{ t('admin.users.form.labels.password') }}</Label>
            <Input 
              id="password"
              type="password"
              v-bind="passwordAttrs"
              v-model="password"
              :placeholder="t('admin.users.form.placeholders.password')"
              :class="errors.password ? 'border-destructive' : ''"
            />
            <p v-if="errors.password" class="text-destructive text-sm">{{ errors.password }}</p>
          </div>
          
          <!-- Role field -->
          <div class="space-y-2">
            <Label for="role">{{ t('admin.users.form.labels.role') }}</Label>
            <Select v-model="role">
              <SelectTrigger :class="errors.role ? 'border-destructive' : ''">
                <SelectValue :placeholder="t('admin.users.form.placeholders.selectRole')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{{ t('dashboard.roles.admin') }}</SelectItem>
                <SelectItem value="user">{{ t('dashboard.roles.user') }}</SelectItem>
              </SelectContent>
            </Select>
            <p v-if="errors.role" class="text-destructive text-sm">{{ errors.role }}</p>
          </div>
          
          <!-- Image field -->
          <div class="space-y-2">
            <Label for="image">{{ t('admin.users.form.labels.image') }}</Label>
            <Input 
              id="image"
              v-bind="imageAttrs"
              v-model="image"
              :placeholder="t('admin.users.form.placeholders.image')"
              :class="errors.image ? 'border-destructive' : ''"
            />
            <p v-if="errors.image" class="text-destructive text-sm">{{ errors.image }}</p>
          </div>

          <!-- Phone number field -->
          <div class="space-y-2">
            <Label for="phoneNumber">{{ t('admin.users.form.labels.phoneNumber') }}</Label>
            <Input 
              id="phoneNumber"
              v-bind="phoneNumberAttrs"
              v-model="phoneNumber"
              :placeholder="t('admin.users.form.placeholders.phoneNumber')"
              :class="errors.phoneNumber ? 'border-destructive' : ''"
            />
            <p v-if="errors.phoneNumber" class="text-destructive text-sm">{{ errors.phoneNumber }}</p>
          </div>

          <!-- Email verified toggle -->
          <div class="flex items-center justify-between">
            <Label for="emailVerified" class="font-semibold">
              {{ t('admin.users.form.labels.emailVerified') }}
            </Label>
            <Switch v-model="emailVerified" />
          </div>

          <!-- Phone verified toggle -->
          <div class="flex items-center justify-between">
            <Label for="phoneNumberVerified" class="font-semibold">
              {{ t('admin.users.form.labels.phoneVerified') }}
            </Label>
            <Switch v-model="phoneNumberVerified" />
          </div>

          <!-- Banned toggle -->
          <div class="flex items-center justify-between">
            <Label for="banned" class="font-semibold">
              {{ t('admin.users.form.labels.banned') }}
            </Label>
            <Switch v-model="banned" />
          </div>
          
          <!-- Ban reason field -->
          <div class="space-y-2">
            <Label for="banReason">{{ t('admin.users.form.labels.banReason') }}</Label>
            <Input
              id="banReason"
              v-bind="banReasonAttrs"
              v-model="banReason"
              :placeholder="t('admin.users.form.placeholders.banReason')"
              :class="errors.banReason ? 'border-destructive' : ''"
            />
            <p v-if="errors.banReason" class="text-destructive text-sm">{{ errors.banReason }}</p>
          </div>

          <!-- Referral info (edit mode only) -->
          <template v-if="isEditMode">
            <div class="border-t pt-4 mt-4">
              <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {{ t('admin.users.form.labels.referralCode') }}
              </h3>
            </div>
            <div class="space-y-2">
              <Label>{{ t('admin.users.form.labels.referralCode') }}</Label>
              <Input readonly :model-value="userData?.referralCode || '—'" class="bg-muted" />
            </div>
            <div class="space-y-2">
              <Label>{{ t('admin.users.form.labels.referredByCode') }}</Label>
              <Input readonly :model-value="userData?.referredByCode || '—'" class="bg-muted" />
            </div>
            <div class="space-y-2">
              <Label>{{ t('admin.users.form.labels.commissionBalance') }}</Label>
              <Input readonly :model-value="userData?.commissionBalance || '0'" class="bg-muted" />
            </div>
          </template>
        </CardContent>
        <CardFooter class="flex justify-between space-x-4 pt-6">
          <div class="flex space-x-4">
            <Button 
              type="submit" 
              :disabled="isSubmitting"
              class="flex items-center gap-2"
            >
              <Save class="h-4 w-4" />
              {{ isSubmitting ? t('common.loading') : (isEditMode ? t('actions.saveChanges') : t('actions.createUser')) }}
            </Button>
            
            <!-- Delete button (only for edit mode) -->
            <AlertDialog v-if="isEditMode">
              <AlertDialogTrigger as-child>
                <Button variant="destructive" type="button" class="flex items-center gap-2">
                  <Trash2 class="h-4 w-4" />
                  {{ t('actions.deleteUser') }}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{{ t('admin.users.deleteDialog.title') }}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {{ t('admin.users.deleteDialog.description') }}
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
import { Save, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { authClientVue } from '@libs/auth/authClient'
import { createAdminUserValidators } from '@libs/validators'
import { useForm } from 'vee-validate'
import type { z } from 'zod'

// Define page metadata
definePageMeta({
  layout: 'admin'
  // No middleware needed - auth.global.ts handles admin routes automatically
})

// Get route params and composables
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const userId = route.params.id as string
const isEditMode = userId !== 'new'

// Create validators with translation function
const { createAdminUserFormSchema, updateAdminUserFormSchema } = createAdminUserValidators(t)

// Choose the appropriate schema based on mode
const validationSchema = computed(() => {
  return isEditMode ? updateAdminUserFormSchema : createAdminUserFormSchema
})

// Setup form with VeeValidate
const { 
  handleSubmit, 
  errors, 
  defineField,
  setValues,
  resetForm
} = useForm({
  validationSchema: validationSchema.value,
  initialValues: {
    name: '',
    email: '',
    password: '',
    role: 'user',
    image: '',
    phoneNumber: '',
    emailVerified: false,
    phoneNumberVerified: false,
    banned: false,
    banReason: ''
  }
})

// Define form fields with VeeValidate
const [name, nameAttrs] = defineField('name')
const [email, emailAttrs] = defineField('email')
const [password, passwordAttrs] = defineField('password')
const [role, roleAttrs] = defineField('role')
const [image, imageAttrs] = defineField('image')
const [phoneNumber, phoneNumberAttrs] = defineField('phoneNumber')
const [banReason, banReasonAttrs] = defineField('banReason')

// Define boolean fields separately (VeeValidate doesn't handle these well with defineField)
const emailVerified = ref(false)
const phoneNumberVerified = ref(false)
const banned = ref(false)

// Loading and error states
const pending = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')

// Define types for API responses
interface UserData {
  id: string
  name: string
  email: string
  role: 'user' | 'admin'
  image?: string | null
  phoneNumber?: string | null
  emailVerified: boolean
  phoneNumberVerified: boolean
  banned: boolean
  banReason?: string | null
  referralCode?: string | null
  referredByCode?: string | null
  commissionBalance?: string | null
}

// Fetch user data for edit mode
let userData: Ref<UserData | undefined> = ref(undefined)

if (isEditMode) {
  const { data } = await useFetch<UserData>(`/api/users/${userId}`, {
    server: false,
    onRequest() {
      pending.value = true
    },
    onResponse({ response }) {
      pending.value = false
      if (response._data) {
        const data = response._data
        // Set form values using VeeValidate
        setValues({
          name: data.name || '',
          email: data.email || '',
          role: (data.role as 'user' | 'admin') || 'user',
          image: data.image || '',
          phoneNumber: data.phoneNumber || '',
          banReason: data.banReason || ''
        })
        
        // Set boolean values separately
        emailVerified.value = data.emailVerified || false
        phoneNumberVerified.value = data.phoneNumberVerified || false
        banned.value = data.banned || false
      }
    },
    onResponseError({ error }) {
      pending.value = false
      errorMessage.value = error?.message || t('admin.users.messages.fetchError')
    }
  })
  userData = data
}

// Form submission with VeeValidate
const onSubmit = handleSubmit(async (values) => {
  isSubmitting.value = true
  errorMessage.value = ''

  try {
    // Prepare form data
    const formData = {
      ...values,
      emailVerified: emailVerified.value,
      phoneNumberVerified: phoneNumberVerified.value,
      banned: banned.value
    }

    // Debug: Log the form data being sent
    console.log('Form data being sent:', formData)

    if (isEditMode) {
      // Update all user data through single API call
      await $fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        body: formData,
      })

      toast.success(t('admin.users.messages.updateSuccess'))
    } else {
      // Create user
      const { data, error } = await authClientVue.admin.createUser({
        name: formData.name,
        email: formData.email,
        password: formData.password || '',
        role: formData.role as 'admin' | 'user',
        data: {
          image: formData.image || undefined,
          phoneNumber: formData.phoneNumber || undefined,
          emailVerified: formData.emailVerified,
          phoneNumberVerified: formData.phoneNumberVerified,
          banned: formData.banned,
          banReason: formData.banReason || undefined,
        },
      })

      if (error) {
        toast.error(error.message || t('admin.users.messages.createError'))
        return
      }

      toast.success(t('admin.users.messages.createSuccess'))
    }

    // Navigate back to users list
    await router.push('/admin/users')
  } catch (error: any) {
    const message = error?.message || t('admin.users.messages.operationFailed')
    errorMessage.value = message
    toast.error(message)
  } finally {
    isSubmitting.value = false
  }
})

// Delete user
const handleDelete = async () => {
  const { data, error } = await authClientVue.admin.removeUser({
    userId,
  })
  
  if (error) {
    const message = error.message || t('admin.users.messages.deleteError')
    errorMessage.value = message
    toast.error(message)
    return
  }
  
  toast.success(t('admin.users.messages.deleteSuccess'))
  await router.push('/admin/users')
}

// Set page title
useHead({
  title: computed(() => isEditMode ? t('admin.users.editUser') : t('admin.users.createUser'))
})
</script> 