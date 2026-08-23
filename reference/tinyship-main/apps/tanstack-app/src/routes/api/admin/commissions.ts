import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/commissions')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { db } = await import('@libs/database')
          const { commission, user } = await import('@libs/database/schema')
          const { eq, desc, count, like, and } = await import('drizzle-orm')

          const url = new URL(request.url)
          const limit = parseInt(url.searchParams.get('limit') || '10') || 10
          const page = parseInt(url.searchParams.get('page') || '1') || 1
          const offset = parseInt(url.searchParams.get('offset') || '') || (page - 1) * limit
          const searchValue = url.searchParams.get('searchValue') || url.searchParams.get('search') || undefined
          const searchField = url.searchParams.get('searchField') || 'referrerEmail'
          const status = url.searchParams.get('status') || undefined

          const whereConditions: any[] = []
          if (status) whereConditions.push(eq(commission.status, status))
          if (searchValue) {
            switch (searchField) {
              case 'referrerEmail':
                whereConditions.push(like(user.email, `%${searchValue}%`))
                break
              case 'referrerName':
                whereConditions.push(like(user.name, `%${searchValue}%`))
                break
              case 'orderId':
                whereConditions.push(like(commission.orderId, `%${searchValue}%`))
                break
              default:
                whereConditions.push(like(user.email, `%${searchValue}%`))
            }
          }
          const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined

          const baseQuery = db.select({
            id: commission.id, referrerId: commission.referrerId, orderId: commission.orderId,
            buyerId: commission.buyerId, orderAmount: commission.orderAmount, currency: commission.currency,
            commissionRate: commission.commissionRate, commissionAmount: commission.commissionAmount,
            status: commission.status, createdAt: commission.createdAt,
            referrerEmail: user.email, referrerName: user.name,
          }).from(commission).leftJoin(user, eq(commission.referrerId, user.id))

          const countQuery = db.select({ count: count() }).from(commission).leftJoin(user, eq(commission.referrerId, user.id))

          const [totalResult, commissions] = await Promise.all([
            whereClause ? countQuery.where(whereClause) : countQuery,
            whereClause
              ? baseQuery.where(whereClause).orderBy(desc(commission.createdAt)).limit(limit).offset(offset)
              : baseQuery.orderBy(desc(commission.createdAt)).limit(limit).offset(offset),
          ])

          return Response.json({
            commissions, total: totalResult[0]?.count || 0,
            page, pageSize: limit, totalPages: Math.ceil((totalResult[0]?.count || 0) / limit),
          })
        } catch (error) {
          console.error('Failed to fetch admin commissions:', error)
          return Response.json({ error: 'Failed to fetch commissions' }, { status: 500 })
        }
      }),
    },
  },
})
