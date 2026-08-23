import { createFileRoute, redirect } from '@tanstack/react-router'
import { config } from '@config'

/**
 * Root-level redirect for /payment-success.
 * Payment providers (Stripe, PayPal, Creem) redirect to /payment-success
 * without a locale prefix. This route forwards to /$lang/payment-success
 * preserving all query parameters.
 */
export const Route = createFileRoute('/payment-success')({
  beforeLoad: ({ location }) => {
    const lang = config.app.i18n.defaultLocale
    throw redirect({
      to: '/$lang/payment-success',
      params: { lang },
      search: Object.fromEntries(new URLSearchParams(location.search)),
    })
  },
})
