import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/subscriptions/')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { db } = await import('@libs/database')
          const { subscription } = await import('@libs/database/schema/subscription')
          const { user } = await import('@libs/database/schema/user')
          const { eq, and, or, like, desc, asc, count, isNotNull, isNull } = await import('drizzle-orm')

          const { searchParams } = new URL(request.url)

          const limit = parseInt(searchParams.get('limit') || '10')
          const offset = parseInt(searchParams.get('offset') || '0')

          const searchField = searchParams.get('searchField')
          const searchValue = searchParams.get('searchValue')

          const statusFilter = searchParams.get('status')
          const paymentTypeFilter = searchParams.get('paymentType')
          const providerFilter = searchParams.get('provider')

          const sortBy = searchParams.get('sortBy') || 'createdAt'
          const sortDirection = searchParams.get('sortDirection') || 'desc'

          const whereConditions: any[] = []

          if (searchValue && searchField) {
            switch (searchField) {
              case 'id':
                whereConditions.push(like(subscription.id, `%${searchValue}%`))
                break
              case 'userId':
                whereConditions.push(eq(subscription.userId, searchValue))
                break
              case 'planId':
                whereConditions.push(like(subscription.planId, `%${searchValue}%`))
                break
              case 'stripeSubscriptionId':
                whereConditions.push(
                  and(
                    isNotNull(subscription.stripeSubscriptionId),
                    like(subscription.stripeSubscriptionId, `%${searchValue}%`),
                  ),
                )
                break
              case 'creemSubscriptionId':
                whereConditions.push(
                  and(
                    isNotNull(subscription.creemSubscriptionId),
                    like(subscription.creemSubscriptionId, `%${searchValue}%`),
                  ),
                )
                break
              case 'dodoSubscriptionId':
                whereConditions.push(
                  and(
                    isNotNull(subscription.dodoSubscriptionId),
                    like(subscription.dodoSubscriptionId, `%${searchValue}%`),
                  ),
                )
                break
              case 'userEmail':
                whereConditions.push(like(user.email, `%${searchValue}%`))
                break
            }
          }

          if (statusFilter && statusFilter !== 'all') {
            whereConditions.push(eq(subscription.status, statusFilter))
          }

          if (paymentTypeFilter && paymentTypeFilter !== 'all') {
            whereConditions.push(eq(subscription.paymentType, paymentTypeFilter))
          }

          if (providerFilter && providerFilter !== 'all') {
            if (providerFilter === 'stripe') {
              whereConditions.push(
                or(isNotNull(subscription.stripeCustomerId), isNotNull(subscription.stripeSubscriptionId)),
              )
            } else if (providerFilter === 'creem') {
              whereConditions.push(
                or(isNotNull(subscription.creemCustomerId), isNotNull(subscription.creemSubscriptionId)),
              )
            } else if (providerFilter === 'dodo') {
              whereConditions.push(
                or(isNotNull(subscription.dodoCustomerId), isNotNull(subscription.dodoSubscriptionId)),
              )
            } else if (providerFilter === 'wechat') {
              whereConditions.push(
                and(
                  isNull(subscription.stripeCustomerId),
                  isNull(subscription.stripeSubscriptionId),
                  isNull(subscription.creemCustomerId),
                  isNull(subscription.creemSubscriptionId),
                  isNull(subscription.dodoCustomerId),
                  isNull(subscription.dodoSubscriptionId),
                ),
              )
            }
          }

          const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined

          const totalResult = await db
            .select({ count: count() })
            .from(subscription)
            .leftJoin(user, eq(subscription.userId, user.id))
            .where(whereClause)

          const total = totalResult[0]?.count || 0

          let orderBy
          switch (sortBy) {
            case 'id':
              orderBy = sortDirection === 'desc' ? desc(subscription.id) : asc(subscription.id)
              break
            case 'userId':
              orderBy = sortDirection === 'desc' ? desc(subscription.userId) : asc(subscription.userId)
              break
            case 'planId':
              orderBy = sortDirection === 'desc' ? desc(subscription.planId) : asc(subscription.planId)
              break
            case 'status':
              orderBy = sortDirection === 'desc' ? desc(subscription.status) : asc(subscription.status)
              break
            case 'createdAt':
            default:
              orderBy = sortDirection === 'desc' ? desc(subscription.createdAt) : asc(subscription.createdAt)
              break
          }

          const subscriptions = await db
            .select({
              id: subscription.id,
              userId: subscription.userId,
              planId: subscription.planId,
              status: subscription.status,
              paymentType: subscription.paymentType,
              stripeCustomerId: subscription.stripeCustomerId,
              stripeSubscriptionId: subscription.stripeSubscriptionId,
              creemCustomerId: subscription.creemCustomerId,
              creemSubscriptionId: subscription.creemSubscriptionId,
              dodoCustomerId: subscription.dodoCustomerId,
              dodoSubscriptionId: subscription.dodoSubscriptionId,
              periodStart: subscription.periodStart,
              periodEnd: subscription.periodEnd,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              createdAt: subscription.createdAt,
              updatedAt: subscription.updatedAt,
              userName: user.name,
              userEmail: user.email,
            })
            .from(subscription)
            .leftJoin(user, eq(subscription.userId, user.id))
            .where(whereClause)
            .orderBy(orderBy)
            .limit(limit)
            .offset(offset)

          return Response.json({
            subscriptions,
            total,
            page: Math.floor(offset / limit) + 1,
            pageSize: limit,
            totalPages: Math.ceil(total / limit),
          })
        } catch (error) {
          console.error('Error fetching subscriptions:', error)
          return new Response('Internal Server Error', { status: 500 })
        }
      }),
    },
  },
})
