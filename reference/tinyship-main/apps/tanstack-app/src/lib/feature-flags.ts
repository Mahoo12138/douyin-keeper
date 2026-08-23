import { createServerFn } from '@tanstack/react-start'

/**
 * Public feature flags resolved from the server runtime.
 *
 * Keeping this server-side lets Workers deployments use the same runtime
 * configuration as every other application, without duplicating a VITE_ flag.
 */
export const getPublicFeatureFlags = createServerFn({ method: 'GET' }).handler(async () => {
  const { config } = await import('@config')

  return {
    affiliateEnabled: config.affiliate.enabled,
  }
})
