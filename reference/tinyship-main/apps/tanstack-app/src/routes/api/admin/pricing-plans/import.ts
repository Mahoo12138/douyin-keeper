import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/pricing-plans/import')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { config } = await import('@config')
          const { pricingAdminService } = await import('@libs/pricing')

          const count = await pricingAdminService.importFromStaticConfig(
            config.payment.plans as unknown as Record<string, any>
          )

          return Response.json({ success: true, imported: count })
        } catch (error) {
          console.error('Error importing static plans:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),
    },
  },
})
