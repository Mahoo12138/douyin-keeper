import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/withdrawal/request')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { requestWithdrawal } = await import('@libs/affiliate')
          const { withdrawalRequestSchema } = await import('@libs/validators')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

          const parsed = withdrawalRequestSchema.safeParse(await request.json())
          if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })
          }

          const { amount, paymentMethod, paymentAccount } = parsed.data

          const result = await requestWithdrawal({
            userId: session.user.id,
            amount,
            paymentMethod,
            paymentAccount,
          })

          if (!result.success) {
            return Response.json({ error: result.error }, { status: 400 })
          }

          return Response.json(result)
        } catch (error) {
          console.error('Failed to request withdrawal:', error)
          return Response.json({ error: 'Failed to request withdrawal' }, { status: 500 })
        }
      }),
    },
  },
})
