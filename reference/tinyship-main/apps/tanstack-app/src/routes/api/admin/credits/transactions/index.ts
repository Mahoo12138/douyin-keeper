import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/credits/transactions/')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { creditService } = await import('@libs/credits/service')

          const { searchParams } = new URL(request.url)

          const limit = parseInt(searchParams.get('limit') || '10')
          const page = parseInt(searchParams.get('page') || '1')

          const searchField = searchParams.get('searchField') || undefined
          const searchValue = searchParams.get('searchValue') || undefined

          const type = searchParams.get('type') || undefined
          const userId = searchParams.get('userId') || undefined

          const sortBy = searchParams.get('sortBy') || 'createdAt'
          const sortDirection = (searchParams.get('sortDirection') as 'asc' | 'desc') || 'desc'

          const result = await creditService.getAllTransactionsPaginated({
            page,
            limit,
            searchField,
            searchValue,
            type: type as any,
            userId,
            sortBy,
            sortDirection,
          })

          return Response.json({
            transactions: result.transactions,
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            totalPages: result.totalPages,
          })
        } catch (error) {
          console.error('Error fetching credit transactions:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),
    },
  },
})
