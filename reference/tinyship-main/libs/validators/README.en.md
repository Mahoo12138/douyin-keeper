# User Validators

TinyShip's internationalized data validation system built on Zod, providing type-safe data validation and multi-language error message support.

## 🌟 Core Features

- **🌍 Full Internationalization** - Multi-language error messages with parameter interpolation
- **🔧 Framework Compatible** - Supports both Vue.js (Nuxt) and React (Next.js)
- **📱 Phone Validation** - Multi-country/region phone number format validation
- **🛡️ Type Safety** - Complete TypeScript type support
- **🎯 Form Integration** - Seamless integration with React Hook Form and VeeValidate
- **⚡ Consistent Experience** - All forms use `onBlur` validation mode

## 📦 Quick Start

### Vue.js / Nuxt.js Usage

```typescript
import { createValidators } from '@libs/validators'

// Directly use Vue i18n's t function in Nuxt.js components
const { t } = useI18n() 
const { loginFormSchema, signupFormSchema } = createValidators(t)

// Use in form validation
const { handleSubmit, errors, defineField } = useForm({
  validationSchema: toTypedSchema(loginFormSchema),
  mode: 'onBlur'
})
```

### React / Next.js Usage

```typescript
import { createValidators, createNextTranslationFunction } from '@libs/validators'
import { useTranslation } from '@/hooks/use-translation'

// In Next.js components
const { t } = useTranslation() 
const tWithParams = createNextTranslationFunction(t) // Create translation function with parameter interpolation
const { loginFormSchema, signupFormSchema } = createValidators(tWithParams)

// Use in form validation
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(loginFormSchema),
  mode: 'onBlur' // Unified validation experience
})
```

## 🔧 Available Validators

### User Authentication Validators

```typescript
const {
  // 📧 Email Registration/Login
  emailSignUpSchema,    // Email registration validation
  signupFormSchema,     // Registration form validation (with optional image)
  emailSignInSchema,    // Email login validation
  loginFormSchema,      // Login form validation (with remember me)
  
  // 📱 Phone Registration/Login
  phoneSignUpSchema,    // Phone registration validation
  phoneLoginSchema,     // Phone login step 1 (send verification code)
  phoneVerifySchema,    // Phone login step 2 (verify code)
  
  // 🔐 Password Management
  forgetPasswordSchema,   // Forgot password validation
  resetPasswordSchema,    // Reset password validation
  changePasswordSchema,   // Change password validation
  
  // 👤 User Management
  userSchema,           // Complete user info validation
  updateUserSchema,     // Update user info (all fields optional)
  userIdSchema,         // User ID validation
} = createValidators(translationFunction)
```

### Phone Validation Support

```typescript
import { countryCodes, type CountryCode } from '@libs/validators'

// Supported country/region codes
console.log(countryCodes) 
// [
//   { code: '+86', name: 'China', flag: '🇨🇳', phoneLength: [11] },
//   { code: '+1', name: 'United States', flag: '🇺🇸', phoneLength: [10] },
//   // More countries...
// ]
```

## 🌍 Internationalization Configuration

### Translation Key Structure

Validators use a unified translation key pattern: `validators.user.{field}.{errorType}`

```typescript
// Translation file example (libs/i18n/locales/en.ts, zh-CN.ts)
export default {
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
        maxLength: "Password must be less than {max} characters",
        mismatch: "Passwords don't match"
      },
      phoneNumber: {
        required: "Please enter phone number",
        invalid: "Invalid phone number format"
      },
      verificationCode: {
        invalidLength: "Verification code must be {length} characters"
      }
    }
  }
}
```

### Parameter Interpolation Examples

```typescript
// English: "Password must be at least 8 characters"
// Chinese: "密码至少需要8个字符"

// Vue.js - Use t function directly
t('validators.user.password.minLength', { min: 8 })

// Next.js - Use enhanced translation function
tWithParams('validators.user.password.minLength', { min: 8 })
```

## 📝 Practical Examples

### Login Form (Next.js)

```tsx
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
    mode: 'onBlur', // Validate on blur
    defaultValues: {
      email: '',
      password: '',
      remember: true
    }
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <input 
          {...register('email')} 
          type="email" 
          autoComplete="email"
        />
        {errors.email && (
          <span className="error">{errors.email.message}</span>
        )}
      </div>
      
      <div>
        <input 
          {...register('password')} 
          type="password"
          autoComplete="current-password"
        />
        {errors.password && (
          <span className="error">{errors.password.message}</span>
        )}
      </div>
      
      <button type="submit">Login</button>
    </form>
  )
}
```

### Registration Form (Nuxt.js)

```vue
<template>
  <form @submit="onSubmit">
    <div>
      <input v-model="name" type="text" />
      <span v-if="errors.name" class="error">{{ errors.name }}</span>
    </div>
    
    <div>
      <input v-model="email" type="email" />
      <span v-if="errors.email" class="error">{{ errors.email }}</span>
    </div>
    
    <div>
      <input v-model="password" type="password" />
      <span v-if="errors.password" class="error">{{ errors.password }}</span>
    </div>
    
    <button type="submit">Register</button>
  </form>
</template>

<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { createValidators } from '@libs/validators'

// Directly use Vue i18n's t function
const { t } = useI18n()
const { signupFormSchema } = createValidators(t)

const { handleSubmit, errors, defineField } = useForm({
  validationSchema: toTypedSchema(signupFormSchema)
})

const [name] = defineField('name')
const [email] = defineField('email')
const [password] = defineField('password')

const onSubmit = handleSubmit((values) => {
  // Handle form submission
})
</script>
```

## 🛠️ Architecture Design

### Validator Factory Pattern

```typescript
// libs/validators/user.ts core implementation
export function createValidators(t: TranslationFunction) {
  const userSchema = z.object({
    name: z.string()
      .min(2, t('validators.user.name.minLength', { min: 2 }))
      .max(50, t('validators.user.name.maxLength', { max: 50 })),
    email: z.string().email(t('validators.user.email.invalid')),
    // More fields...
  })

  return {
    userSchema,
    loginFormSchema: userSchema.pick({ email: true, password: true })
      .extend({ remember: z.boolean().default(false) }),
    // More validators...
  }
}
```

### Framework Adaptation Layer

```typescript
// Vue.js - Use Vue i18n's t function directly
const { t } = useI18n()
const { loginFormSchema } = createValidators(t)

// Next.js - Use translation function factory to create enhanced translation function
import { createNextTranslationFunction } from '@libs/validators'

const { t } = useTranslation()
const tWithParams = createNextTranslationFunction(t)
const { loginFormSchema } = createValidators(tWithParams)
```

## 🧪 Testing and Debugging

### Test Pages

- **Next.js**: Visit `/test-validator-nextjs` to test validator functionality
- **Nuxt.js**: Visit `/test-validator` to test validator functionality

### Run Unit Tests

```bash
# Run all validator tests
pnpm test tests/unit/validators/

# Run integration tests
pnpm test tests/unit/validators/integration.test.ts
```

## 📚 API Reference

### createValidators(translationFunction)

Main factory function for creating internationalized validators.

**Parameters:**
- `translationFunction: (key: string, params?: Record<string, any>) => string`

**Returns:**
Object containing all validator schemas.

### Utility Functions

```typescript
// Next.js translation function creator
createNextTranslationFunction(translations: object): TranslationFunction
```

## 🎯 Best Practices

### Form Validation Configuration

```typescript
// Recommended form configuration
const form = useForm({
  resolver: zodResolver(schema),
  mode: 'onBlur',              // Unified blur validation
  reValidateMode: 'onChange',  // Real-time validation after correction
  defaultValues: { /* */ }     // Provide default values
})
```

### Error Message Display

```tsx
// Use validator error messages directly
{errors.fieldName && (
  <span className="error">{errors.fieldName.message}</span>
)}
```

### Type Safety

```typescript
import type { z } from 'zod'

// Automatically infer form data types
type LoginFormData = z.infer<typeof loginFormSchema>
type SignupFormData = z.infer<typeof signupFormSchema>
```

## 🔮 Project Integration

### Current Integration Status

- ✅ **Next.js App** - Fully integrated with unified validation experience
- ✅ **Nuxt.js App** - Fully integrated with unified validation experience
- ✅ **Multi-language Support** - English and Chinese error messages
- ✅ **Phone Validation** - Multi-country/region support
- ✅ **Type Safety** - Complete TypeScript support

### Integrated Forms

- Login form (`/signin`)
- Registration form (`/signup`) 
- Forgot password form (`/forgot-password`)
- Reset password form (`/reset-password`)
- Phone login form (`/cellphone`)
- Change password dialog
- Admin user management form

## 🤝 Contributing

### Adding New Validators

1. Add validator logic to `libs/validators/user.ts`
2. Add corresponding error message keys to translation files
3. Update type definitions and exports
4. Add unit tests
5. Update documentation

### Adding New Translations

1. Add new language files to `libs/i18n/locales/`
2. Add `validators.user.*` translation keys
3. Test parameter interpolation functionality

## 📄 License

MIT License

---

**💡 Tip**: This is a modern, fully internationalized validator system. Vue.js uses the `t` function directly, while Next.js uses `createNextTranslationFunction` to create an enhanced translation function. 