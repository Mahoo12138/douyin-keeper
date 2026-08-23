# AGENTS.md

## Overview

Email service with Resend and Cloudflare provider implementations and internationalized templates, shared by Next.js, Nuxt.js, and TanStack Start.  
Current strategy uses **MJML at build-time** and **compiled HTML at runtime** so Cloudflare Workers can run without CommonJS compatibility issues from MJML's dependency tree.

## Setup Commands

```bash
# Environment configuration required
# Add to .env file:
RESEND_API_KEY=your_resend_api_key
EMAIL_DEFAULT_FROM=noreply@yourdomain.com

# Shared Cloudflare account credentials
# Reused by Cloudflare Email Sending and Cloudflare deployment tooling
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token

# Other providers planned but not yet implemented:
# SENDGRID_API_KEY=your_sendgrid_api_key (planned)
# SMTP_USERNAME=your_smtp_username (planned)
# SMTP_PASSWORD=your_smtp_password (planned)

# No additional installation - configured via @config

# Compile MJML templates to runtime-safe HTML module
pnpm email:compile

# Smoke-test real email sending without running the full app
pnpm email:test -- basic --to you@example.com --provider resend
pnpm email:test -- basic --to you@example.com --provider cloudflare
```

## Code Style

- Resend and Cloudflare implemented, with multi-provider interface design for future extensions
- MJML source templates are compiled into static HTML before runtime
- Configuration split: sensitive data in env vars, non-sensitive in `@config`
- Internationalization support via `@libs/i18n`
- Template variables with placeholder replacement (`{{name}}`, `{{expiry_hours}}`)
- TypeScript interfaces ready for future provider implementations

## Runtime Compatibility Strategy

### Why we compile templates

- `mjml` is not suitable for strict edge runtime execution (Cloudflare Workers ESM constraints, transitive CJS-heavy dependencies).
- To keep compatibility across all apps (including TanStack CF mode), runtime email rendering must avoid loading `mjml`.
- We compile once and render many times: compile MJML to HTML ahead of time, then only perform lightweight variable substitution at runtime.

### Current template pipeline

1. Author MJML in `libs/email/templates/templates.ts`
2. Compile via `libs/email/templates/compile.ts`
3. Generated output written to `libs/email/templates/compiled.ts`
4. Runtime uses `libs/email/templates/index.ts` with `renderTemplate()` substitutions only

### About Maizzle

- Maizzle is also primarily a **build-time** framework, not a drop-in runtime compiler for Workers.
- Replacing MJML with Maizzle would still require a compile/build step.
- Because this repository needs one shared email implementation for Next/Nuxt/TanStack, the current compile-to-static-HTML approach remains the most stable option.

## Usage Examples

### Template Email Sending

```typescript
import { sendVerificationEmail, sendResetPasswordEmail } from '@libs/email';

// Verification email
await sendVerificationEmail('user@example.com', {
  name: 'vikingmute',
  verification_url: 'https://example.com/verify?token=123',
  expiry_hours: 1,
  locale: 'zh-CN' // 'en' | 'zh-CN'
});

// Password reset email
await sendResetPasswordEmail('user@example.com', {
  name: 'vikingmute',
  reset_url: 'https://example.com/reset?token=456',
  expiry_hours: 1,
  locale: 'zh-CN'
});
```

### Basic Email Sending

```typescript
import { sendEmail } from '@libs/email';

// Using default provider
await sendEmail({
  to: 'user@example.com',
  subject: 'Welcome to our service',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  text: 'Welcome! Thanks for signing up.'
});

// Explicitly specify Cloudflare provider
await sendEmail({
  to: 'user@example.com',
  subject: 'Welcome',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  text: 'Welcome! Thanks for signing up.',
  provider: 'cloudflare'
});
```

### Error Handling

```typescript
const result = await sendEmail({
  to: 'user@example.com',
  subject: 'Test',
  html: '<p>Test email</p>'
});

if (!result.success) {
  console.error('Email failed:', result.error?.message);
  console.error('Provider:', result.error?.provider);
}
```

## Common Tasks

### Available Email Templates

- **Verification Email**: User registration email verification
- **Password Reset Email**: Forgot password reset links
- **Supported Languages**: Chinese (`zh-CN`) and English (`en`)
- **Responsive Design**: MJML-based responsive email layouts

### Provider Configuration

```typescript
// Configuration in config.ts (current implementation)
email: {
  defaultProvider: 'resend',
  defaultFrom: 'noreply@example.com',
  resend: {
    apiKey: getEnvForService('RESEND_API_KEY', 'Resend Email'),
  },
  cloudflare: {
    accountId: getEnvForService('CLOUDFLARE_ACCOUNT_ID', 'Cloudflare Email'),
    apiToken: getEnvForService('CLOUDFLARE_API_TOKEN', 'Cloudflare Email'),
  },
  // Planned providers (not yet implemented):
  // sendgrid: {
  //   apiKey: requireEnv('SENDGRID_API_KEY'),
  // },
  // smtp: {
  //   host: 'smtp.example.com',
  //   port: 587,
  //   username: requireEnv('SMTP_USERNAME'),
  //   password: requireEnv('SMTP_PASSWORD'),
  //   secure: true,
  // }
}
```

### Cloudflare Notes

- Shared implementation uses the Cloudflare **REST API**, not Workers binding
- Cloudflare Email Sending requires domain onboarding before sending
- The `from` address must belong to a domain with Email Sending enabled
- Prefer providing both `html` and `text`
- REST API uses `reply_to`; Workers binding uses `replyTo`
- REST returns delivery arrays; Workers binding returns `messageId`

### Add New Template

1. Design template using [MJML online editor](https://mjml.io/try-it-live/)
2. Add MJML template string in `templates/templates.ts`
3. Run `pnpm email:compile` to regenerate `templates/compiled.ts`
4. Add interface and generation function in `templates/index.ts`
5. Add translations in `@libs/i18n` locales
6. Add sender function in `templates-sender.ts`

### Add New Provider

1. Add environment variables to `.env.example`
2. Add provider config to `config/email.ts`
3. Create provider implementation in `providers/` (e.g., `sendgrid.ts`, `smtp.ts`)
4. Provider types already exist in `types.ts`
5. Update case handling in `email-sender.ts` and `templates-sender.ts`

## Testing Instructions

```bash
# Test email configuration
# 1. Verify all environment variables are set
# 2. Test basic email sending with default provider
# 3. Test template emails with different locales
# 4. Verify error handling for invalid configurations

# Template testing
# 1. Use MJML online editor for template preview
# 2. Run `pnpm email:compile` and ensure `compiled.ts` is updated
# 3. Test variable placeholder replacement
# 4. Verify responsive design on different devices
# 5. Test both languages (en/zh-CN)
```

## Troubleshooting

### Configuration Issues
- Verify `RESEND_API_KEY` environment variable is set
- Verify `EMAIL_DEFAULT_FROM` is set
- If using Cloudflare, verify `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`
- Check `config/email.ts` email configuration is properly structured
- Ensure `defaultProvider` points to an implemented provider

### Template Problems
- Use MJML online editor to validate template syntax
- Check placeholder variables match expected format (`{{variable}}`)
- Verify translation keys exist in `@libs/i18n` for both languages
- If template changes do not take effect, re-run `pnpm email:compile`

### Provider Errors
- **Resend**: Check API key validity and domain verification
- **Cloudflare**: Confirm the domain is onboarded for Email Sending and the `from` address uses that domain
- **SendGrid**: Not implemented yet - will return "UnsupportedProvider" error
- **SMTP**: Not implemented yet - will return "UnsupportedProvider" error

### Monorepo Deployment
- Templates are inlined - no file path issues
- Ensure all dependencies are properly linked
- Check imports resolve correctly across monorepo boundaries

## Architecture Notes

- **Current Implementation**: Resend and Cloudflare providers are implemented and functional
- **Multi-Provider Design**: Architecture supports multiple providers, interfaces ready for SendGrid/SMTP
- **Template System**: MJML source + generated HTML output with internationalization
- **Workers Compatibility**: Runtime does not load `mjml` or `handlebars`; only precompiled HTML is rendered via `renderTemplate()`
- **Cloudflare Strategy**: Shared library uses REST API first; Workers binding can be added later as a TanStack-specific optimization
- **Configuration Split**: Sensitive data in environment variables, settings in `@config`
- **Internationalization**: Integrated with `@libs/i18n` for multilingual support
- **Error Handling**: Standardized response format with provider-specific error details
- **Future Extensibility**: Type definitions and interfaces ready for additional provider implementations
- **Monorepo Ready**: Designed for shared usage across Next.js, Nuxt.js, and TanStack Start applications
