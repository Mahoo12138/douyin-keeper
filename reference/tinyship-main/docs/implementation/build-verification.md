# Build Verification Setup

This project uses a **build-first approach** for code verification:

## Philosophy

**Build is the source of truth**: Instead of running separate type-checking that may have different behavior than the actual build, we directly test the build process. If code builds successfully, it's acceptable.

## CI/CD Pipeline (GitHub Actions)

**Purpose**: Verify code builds and tests pass in a clean environment

**Triggers**:
- On push to `main` or `develop` branches
- On pull requests to `main` or `develop` branches

**Jobs**:
1. **Build**: Builds Next.js, Nuxt.js, and TanStack Start apps (build includes TypeScript checking)
2. **Test**: Runs all test suites

**Why this approach?**
- ✅ Build is the actual goal - if it builds, code works
- ✅ Avoids false positives from type-check vs build mismatches
- ✅ Faster feedback (no separate type-check step)
- ✅ Consistent with deployment process

## Pre-commit Hooks

**Current status**: Disabled

**Reason**: Build verification is handled in CI/CD. Pre-commit hooks could run build, but:
- ❌ Build is slow (not suitable for pre-commit)
- ❌ Type-check has different behavior than build
- ✅ CI/CD provides sufficient protection

**If you want to test locally before committing**:
```bash
pnpm build
```

## Manual Commands

```bash
# Build all projects (includes TypeScript checking)
pnpm build

# Build specific app
pnpm build:next
pnpm build:nuxt
pnpm build:tanstack

# Run tests
pnpm test

# Optional: Run type-check manually (if needed)
pnpm type-check
```

## Best Practices

1. **Test builds locally** - Run `pnpm build` before pushing significant changes
2. **Check CI status** - Wait for green checks before merging PRs
3. **Fix build errors immediately** - Don't let broken builds accumulate
4. **Trust the build** - If build succeeds, code is acceptable

## Why No Pre-commit Build Check?

- Build is too slow for pre-commit hooks (would slow down development)
- CI/CD provides sufficient protection
- Developers can run `pnpm build` manually when needed
- Faster development workflow without hook delays

## Type-check Scripts

Type-check scripts are still available for manual use:
- `pnpm type-check` - Run type checking manually
- Useful for IDE/editor integration
- Not used in CI/CD (build is used instead)


