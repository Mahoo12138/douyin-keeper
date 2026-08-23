import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'
import type { CreditTransactionType } from '@libs/credits'

export const Route = createFileRoute('/api/credits/transactions')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { creditService } = await import('@libs/credits')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

          const url = new URL(request.url)
          const page = parseInt(url.searchParams.get('page') || '1', 10)
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 100)
          const type = url.searchParams.get('type') as CreditTransactionType | null

          const result = await creditService.getTransactionsPaginated(session.user.id, {
            page,
            limit,
            type: type || undefined,
          })
          return Response.json(result)
        } catch (error) {
          console.error('Failed to fetch credit transactions:', error)
          return Response.json({ error: 'Failed to fetch credit transactions' }, { status: 500 })
        }
      }),
    },
  },
})
