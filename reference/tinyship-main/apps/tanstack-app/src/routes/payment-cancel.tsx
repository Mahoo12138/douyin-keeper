import { createFileRoute, redirect } from '@tanstack/react-router'
import { config } from '@config'

/**
 * Root-level redirect for /payment-cancel.
 * Payment providers redirect to /payment-cancel without a locale prefix.
 * This route forwards to /$lang/payment-cancel preserving all query parameters.
 */
export const Route = createFileRoute('/payment-cancel')({
  beforeLoad: ({ location }) => {
    const lang = config.app.i18n.defaultLocale
    throw redirect({
      to: '/$lang/payment-cancel',
      params: { lang },
      search: Object.fromEntries(new URLSearchParams(location.search)),
    })
  },
})
