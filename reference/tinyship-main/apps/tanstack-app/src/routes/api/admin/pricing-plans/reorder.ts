import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/pricing-plans/reorder')({
  server: {
    handlers: {
      PUT: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const body = await request.json()
          const { planOrders } = body as { planOrders: { id: string; sortOrder: number }[] }

          if (!planOrders || !Array.isArray(planOrders)) {
            return Response.json(
              { error: 'Missing required field: planOrders (array of { id, sortOrder })' },
              { status: 400 }
            )
          }

          const { pricingAdminService } = await import('@libs/pricing')
          await pricingAdminService.reorderPlans(planOrders)

          return Response.json({ success: true })
        } catch (error) {
          console.error('Error reordering pricing plans:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),
    },
  },
})
