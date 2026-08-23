import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/pricing-plans/')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { pricingAdminService } = await import('@libs/pricing')
          const { config } = await import('@config')
          const plans = await pricingAdminService.getAllPlans()

          return Response.json({ plans, pricingMode: config.payment.pricingMode })
        } catch (error) {
          console.error('Error fetching pricing plans:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),

      POST: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const body = await request.json()

          if (!body.provider || !body.amount || !body.currency || !body.durationType || !body.i18n) {
            return Response.json(
              { error: 'Missing required fields: provider, amount, currency, durationType, i18n' },
              { status: 400 }
            )
          }

          const { pricingAdminService } = await import('@libs/pricing')
          const plan = await pricingAdminService.createPlan(body)

          return Response.json({ plan }, { status: 201 })
        } catch (error) {
          console.error('Error creating pricing plan:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),

      PUT: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const body = await request.json()

          if (!body.id) {
            return Response.json({ error: 'Missing required field: id' }, { status: 400 })
          }

          const { pricingAdminService } = await import('@libs/pricing')
          const plan = await pricingAdminService.updatePlan(body)

          if (!plan) {
            return Response.json({ error: 'Plan not found' }, { status: 404 })
          }

          return Response.json({ plan })
        } catch (error) {
          console.error('Error updating pricing plan:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),

      DELETE: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { searchParams } = new URL(request.url)
          const id = searchParams.get('id')
          const hard = searchParams.get('hard') === 'true'

          if (!id) {
            return Response.json({ error: 'Missing required query param: id' }, { status: 400 })
          }

          const { pricingAdminService } = await import('@libs/pricing')
          const success = hard
            ? await pricingAdminService.hardDeletePlan(id)
            : await pricingAdminService.deletePlan(id)

          if (!success) {
            return Response.json({ error: 'Plan not found' }, { status: 404 })
          }

          return Response.json({ success: true })
        } catch (error) {
          console.error('Error deleting pricing plan:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),
    },
  },
})
