import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/pricing/plans')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { getActivePlans, getPlansForLocale } = await import('@libs/pricing')

          const { searchParams } = new URL(request.url)
          const locale = searchParams.get('locale') || 'en'

          const allPlans = await getActivePlans()
          const plans = getPlansForLocale(allPlans, locale)

          return Response.json({ plans })
        } catch (error) {
          console.error('Error fetching pricing plans:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),
    },
  },
})
