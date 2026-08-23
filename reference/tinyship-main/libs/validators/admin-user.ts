import { z } from 'zod'
import { userRoles } from '../database/constants'

// Translation function type
type TranslationFunction = (key: string, params?: Record<string, any>) => string

// Admin user validator factory function
export function createAdminUserValidators(t: TranslationFunction) {
  // Base admin user schema for form validation
  const adminUserSchema = z.object({
    name: z.string()
      .min(2, t('validators.user.name.minLength', { min: 2 }))
      .max(50, t('validators.user.name.maxLength', { max: 50 })),
    email: z.email(t('validators.user.email.invalid')),
    role: z.enum([userRoles.ADMIN, userRoles.USER], {
      error: t('admin.users.form.validation.roleRequired')
    }),
    image: z.url(t('validators.user.image.invalidUrl'))
      .optional()
      .or(z.literal('')),
    phoneNumber: z.string()
      .optional()
      .or(z.literal('')),
    emailVerified: z.boolean(),
    phoneNumberVerified: z.boolean(),
    banned: z.boolean(),
    banReason: z.string()
      .optional()
      .or(z.literal(''))
  })

  // Create user form schema (includes password)
  const createAdminUserFormSchema = adminUserSchema.extend({
    password: z.string()
      .min(8, t('validators.user.password.minLength', { min: 8 }))
      .max(100, t('validators.user.password.maxLength', { max: 100 }))
  })

  // Update user form schema (password is optional)
  const updateAdminUserFormSchema = adminUserSchema.extend({
    password: z.string()
      .min(8, t('validators.user.password.minLength', { min: 8 }))
      .max(100, t('validators.user.password.maxLength', { max: 100 }))
      .optional()
      .or(z.literal(''))
  })

  // User ID validation
  const userIdSchema = z.object({
    id: z.string().min(1, t('validators.user.id.required'))
  })

  // Ban user schema
  const banUserSchema = z.object({
    userId: z.string().min(1, t('validators.user.id.required')),
    banReason: z.string().optional()
  })

  // Update role schema
  const updateRoleSchema = z.object({
    userId: z.string().min(1, t('validators.user.id.required')),
    role: z.enum([userRoles.ADMIN, userRoles.USER], {
      error: t('admin.users.form.validation.roleRequired')
    })
  })

  return {
    adminUserSchema,
    createAdminUserFormSchema,
    updateAdminUserFormSchema,
    userIdSchema,
    banUserSchema,
    updateRoleSchema
  }
}

// Export types
export type AdminUserValidators = ReturnType<typeof createAdminUserValidators> 