import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/credits/balance')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { creditService } = await import('@libs/credits')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

          const balance = await creditService.getBalance(session.user.id)
          return Response.json({ balance })
        } catch (error) {
          console.error('Failed to fetch credit balance:', error)
          return Response.json({ error: 'Failed to fetch credit balance' }, { status: 500 })
        }
      }),
    },
  },
})
