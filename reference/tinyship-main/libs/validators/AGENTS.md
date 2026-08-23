# AGENTS.md

## Overview

Internationalized data validation system built on Zod v4. Provides type-safe validation with multilingual error messages for both Next.js (React) and Nuxt.js (Vue) applications using factory pattern and framework adapters.

## Setup Commands

```bash
# No installation needed - pure TypeScript library

# Import validators factory
import { createValidators, createNextTranslationFunction } from '@libs/validators'

# Import country codes for phone validation
import { countryCodes, type CountryCode } from '@libs/validators'
```

## Code Style

- Zod v4 schemas with internationalized error messages
- Factory pattern: `createValidators(translationFunction)`
- Framework adapters for React Hook Form and VeeValidate
- Translation key pattern: `validators.user.{field}.{errorType}`
- Unified `onBlur` validation mode across all forms
- TypeScript inference from schemas

## Usage Examples

### Next.js (React Hook Form)

```typescript
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createValidators, createNextTranslationFunction } from '@libs/validators'
import { useTranslation } from '@/hooks/use-translation'

export function LoginForm() {
  const { t } = useTranslation()
  const tWithParams = createNextTranslationFunction(t)
  const { loginFormSchema } = createValidators(tWithParams)
  
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginFormSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '', remember: true }
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} type="email" />
      {errors.email && <span>{errors.email.message}</span>}
    </form>
  )
}
```

### Nuxt.js (VeeValidate)

```vue
<template>
  <form @submit="onSubmit">
    <input v-model="email" type="email" />
    <span v-if="errors.email">{{ errors.email }}</span>
  </form>
</template>

<script setup>
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { createValidators } from '@libs/validators'

const { t } = useI18n()
const { loginFormSchema } = createValidators(t)

const { handleSubmit, errors, defineField } = useForm({
  validationSchema: toTypedSchema(loginFormSchema),
  mode: 'onBlur'
})

const [email] = defineField('email')
</script>
```

### Phone Number Validation

```typescript
import { countryCodes } from '@libs/validators'

// Available country codes
const phoneCountries = countryCodes
// [
//   { code: '+86', name: '中国', flag: '🇨🇳', phoneLength: [11] },
//   { code: '+1', name: '美国', flag: '🇺🇸', phoneLength: [10] },
// ]

const { phoneLoginSchema } = createValidators(tWithParams)
```

## Common Tasks

### Available Validators

```typescript
const {
  // Email authentication
  emailSignUpSchema,    // Email registration
  signupFormSchema,     // Registration form (with optional image)
  emailSignInSchema,    // Email login
  loginFormSchema,      // Login form (with remember me)
  
  // Phone authentication
  phoneSignUpSchema,    // Phone registration
  phoneLoginSchema,     // Phone login step 1 (send code)
  phoneVerifySchema,    // Phone login step 2 (verify code)
  
  // Password management
  forgetPasswordSchema, // Forgot password
  resetPasswordSchema,  // Reset password
  changePasswordSchema, // Change password
  
  // User management
  userSchema,          // Complete user info
  updateUserSchema,    // Update user (all fields optional)
  userIdSchema,        // User ID validation
} = createValidators(translationFunction)

// Withdrawal
const {
  withdrawalFormSchema,  // Withdrawal request form
} = createWithdrawalValidators(translationFunction)
```

### Add Translation Keys

Translation pattern: `validators.user.{field}.{errorType}`

```typescript
// In libs/i18n/locales/en.ts
validators: {
  user: {
    name: {
      minLength: "Name must be at least {min} characters",
      maxLength: "Name must be less than {max} characters"
    },
    email: {
      invalid: "Please enter a valid email address"
    },
    password: {
      minLength: "Password must be at least {min} characters",
      mismatch: "Passwords don't match"
    }
  }
}
```

### Type Safety

```typescript
import type { z } from 'zod'

// Auto-infer form data types
type LoginFormData = z.infer<typeof loginFormSchema>
type SignupFormData = z.infer<typeof signupFormSchema>
```

## Testing Instructions

```bash
# Test validation logic
# 1. Create test with invalid inputs
# 2. Verify error messages appear in correct language
# 3. Test parameter interpolation works
# 4. Verify TypeScript types are correct

# Form integration testing
# 1. Test onBlur validation timing
# 2. Verify error clearing after correction
# 3. Test form submission with valid/invalid data
```

## Troubleshooting

### Missing Translation Keys
- Ensure translation keys exist in both `en.ts` and `zh-CN.ts`
- Follow pattern: `validators.user.{field}.{errorType}`
- Check parameter interpolation syntax: `{min}`, `{max}`, etc.

### Framework Integration Issues
- **Next.js**: Use `createNextTranslationFunction` wrapper
- **Nuxt.js**: Pass `t` function directly to `createValidators`
- Verify form library integration (React Hook Form vs VeeValidate)

### Type Errors
- Ensure proper Zod schema imports
- Check `z.infer<typeof schema>` usage for type inference
- Verify resolver configuration matches framework

## Architecture Notes

- **Factory Pattern**: `createValidators()` creates schemas with localized messages
- **Framework Adapters**: Separate adapters for React Hook Form and VeeValidate
- **Translation Integration**: Uses `@libs/i18n` for multilingual error messages
- **Phone Validation**: Supports multiple countries with country codes and length validation
- **Type Safety**: Full TypeScript support with schema inference
- **Validation Timing**: Unified `onBlur` mode for consistent UX across frameworks
- **Integration Status**: Fully integrated in login, signup, password reset, and admin forms
