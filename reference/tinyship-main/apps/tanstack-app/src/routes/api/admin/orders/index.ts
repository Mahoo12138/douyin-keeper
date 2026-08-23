import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/orders/')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { db } = await import('@libs/database')
          const { order } = await import('@libs/database/schema/order')
          const { user } = await import('@libs/database/schema/user')
          const { eq, and, like, desc, asc, count } = await import('drizzle-orm')

          const { searchParams } = new URL(request.url)

          const limit = parseInt(searchParams.get('limit') || '10')
          const offset = parseInt(searchParams.get('offset') || '0')

          const searchField = searchParams.get('searchField')
          const searchValue = searchParams.get('searchValue')

          const statusFilter = searchParams.get('status')
          const providerFilter = searchParams.get('provider')

          const sortBy = searchParams.get('sortBy') || 'createdAt'
          const sortDirection = searchParams.get('sortDirection') || 'desc'

          const whereConditions: any[] = []

          if (searchValue && searchField) {
            switch (searchField) {
              case 'id':
                whereConditions.push(eq(order.id, searchValue))
                break
              case 'userId':
                whereConditions.push(eq(order.userId, searchValue))
                break
              case 'planId':
                whereConditions.push(like(order.planId, `%${searchValue}%`))
                break
              case 'userEmail':
                whereConditions.push(like(user.email, `%${searchValue}%`))
                break
              case 'providerOrderId':
                whereConditions.push(like(order.providerOrderId, `%${searchValue}%`))
                break
            }
          }

          if (statusFilter && statusFilter !== 'all') {
            whereConditions.push(eq(order.status, statusFilter))
          }

          if (providerFilter && providerFilter !== 'all') {
            whereConditions.push(eq(order.provider, providerFilter))
          }

          const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined

          const totalResult = await db
            .select({ count: count() })
            .from(order)
            .leftJoin(user, eq(order.userId, user.id))
            .where(whereClause)

          const total = totalResult[0]?.count || 0

          let orderBy
          switch (sortBy) {
            case 'id':
              orderBy = sortDirection === 'desc' ? desc(order.id) : asc(order.id)
              break
            case 'userId':
              orderBy = sortDirection === 'desc' ? desc(order.userId) : asc(order.userId)
              break
            case 'userEmail':
              orderBy = sortDirection === 'desc' ? desc(user.email) : asc(user.email)
              break
            case 'amount':
              orderBy = sortDirection === 'desc' ? desc(order.amount) : asc(order.amount)
              break
            case 'status':
              orderBy = sortDirection === 'desc' ? desc(order.status) : asc(order.status)
              break
            case 'provider':
              orderBy = sortDirection === 'desc' ? desc(order.provider) : asc(order.provider)
              break
            case 'createdAt':
            default:
              orderBy = sortDirection === 'desc' ? desc(order.createdAt) : asc(order.createdAt)
              break
          }

          const orders = await db
            .select({
              id: order.id,
              userId: order.userId,
              amount: order.amount,
              currency: order.currency,
              planId: order.planId,
              status: order.status,
              provider: order.provider,
              providerOrderId: order.providerOrderId,
              metadata: order.metadata,
              createdAt: order.createdAt,
              updatedAt: order.updatedAt,
              userName: user.name,
              userEmail: user.email,
            })
            .from(order)
            .leftJoin(user, eq(order.userId, user.id))
            .where(whereClause)
            .orderBy(orderBy)
            .limit(limit)
            .offset(offset)

          return Response.json({
            orders,
            total,
            page: Math.floor(offset / limit) + 1,
            pageSize: limit,
            totalPages: Math.ceil(total / limit),
          })
        } catch (error) {
          console.error('Error fetching orders:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),
    },
  },
})
